import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { copyTemplates, BLOCK_MANIFEST } from '../scripts/copy-templates.mjs';
import { reviewScan } from '../scripts/review-scan.mjs';

const BLOCKS_DIR = path.resolve(import.meta.dirname, '..', 'templates', 'blocks');
const blockNames = fs
  .readdirSync(BLOCKS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

function readManifest(name) {
  return JSON.parse(fs.readFileSync(path.join(BLOCKS_DIR, name, BLOCK_MANIFEST), 'utf8'));
}

function blockFiles(name) {
  return fs
    .readdirSync(path.join(BLOCKS_DIR, name), { recursive: true })
    .map((p) => String(p).replace(/\\/g, '/'))
    .filter((p) => p !== BLOCK_MANIFEST && fs.statSync(path.join(BLOCKS_DIR, name, p)).isFile())
    .sort();
}

test('B1: all planned blocks exist', () => {
  for (const name of ['state-panel', 'form', 'chart-card', 'data-table', 'dashboard-shell', 'landing-sections']) {
    assert.ok(blockNames.includes(name), `missing block ${name}`);
  }
});

for (const name of blockNames) {
  test(`B1: ${name} manifest matches its files and imports`, () => {
    const manifest = readManifest(name);
    assert.equal(manifest.name, name);
    assert.ok(typeof manifest.description === 'string' && manifest.description.length <= 200);
    assert.ok(Array.isArray(manifest.shadcn) && manifest.shadcn.every((c) => /^[a-z][a-z0-9-]*$/.test(c)));
    assert.ok(Array.isArray(manifest.dependencies) && manifest.dependencies.every((d) => typeof d === 'string'));
    assert.deepEqual([...manifest.files].sort(), blockFiles(name));

    const uiImports = new Set();
    const packageImports = new Set();
    for (const file of blockFiles(name)) {
      const source = fs.readFileSync(path.join(BLOCKS_DIR, name, file), 'utf8');
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b(?![\w-])/, `${name}/${file} has a raw hex color`);
      for (const [, spec] of source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)) {
        if (spec.startsWith('@/components/ui/')) uiImports.add(spec.slice('@/components/ui/'.length));
        else if (spec.startsWith('@/components/blocks/')) {
          // Blocks install independently, so a block may only import its own files.
          assert.ok(spec.startsWith(`@/components/blocks/${name}/`), `${name}/${file} imports another block: ${spec}`);
        }
        else if (!spec.startsWith('.') && !spec.startsWith('@/')) packageImports.add(spec);
      }
    }

    // Every shadcn component the block imports must be installed by the blocks skill.
    for (const ui of uiImports) {
      assert.ok(manifest.shadcn.includes(ui), `${name} imports ui/${ui} but block.json does not list it`);
    }
    // Every npm package it imports must be installed too (next, react and lucide come with the project).
    const provided = new Set(['next', 'react', 'lucide-react']);
    const declared = manifest.dependencies.map((d) => d.replace(/(?<=.)@.*$/, ''));
    for (const pkg of packageImports) {
      const root = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
      assert.ok(provided.has(root) || declared.includes(root), `${name} imports ${root} but block.json does not list it`);
    }
  });
}

test('B1: every block template passes review-scan with no findings', () => {
  const files = blockNames.flatMap((name) => blockFiles(name).map((f) => `${name}/${f}`));
  const result = reviewScan(BLOCKS_DIR, files, { projectChecks: false });
  const tsxCount = files.filter((f) => f.endsWith('.tsx')).length;
  assert.ok(result.scanned.length >= tsxCount, `scanned ${result.scanned.length} of ${tsxCount} .tsx files`);
  assert.equal(result.counts.error, 0, JSON.stringify(result.findings, null, 2));
  assert.equal(result.findings.length, 0, JSON.stringify(result.findings, null, 2));
});

test('B1.1: copy-templates installs a block under components/blocks and skips block.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-blocks-'));
  try {
    const files = {
      'package.json': JSON.stringify({ name: 'app', dependencies: { next: '16.0.0', react: '19.0.0', tailwindcss: '^4.0.0' } }),
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
        aliases: { components: '@/components', ui: '@/components/ui', utils: '@/lib/utils' },
      }),
    };
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tmpDir, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, rel), content);
    }

    const res = copyTemplates('blocks/form', tmpDir);
    assert.equal(res.destinationDir, 'src/components/blocks/form');
    assert.deepEqual(res.files.map((f) => f.target).sort(), [
      'src/components/blocks/form/contact-form.tsx',
      'src/components/blocks/form/contact-schema.ts',
    ]);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'src/components/blocks/form', BLOCK_MANIFEST)));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('B1.2: a block app/ folder is installed into the project app dir', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-blocks-app-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src/app/layout.tsx'), '');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { next: '16.0.0', react: '19.0.0', tailwindcss: '^4.0.0' } }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'components.json'),
      JSON.stringify({ style: 'radix-nova', tailwind: { css: 'src/app/globals.css' }, aliases: { components: '@/components' } }),
    );

    const res = copyTemplates('blocks/dashboard-shell', tmpDir);
    const targets = res.files.map((f) => f.target);
    assert.ok(targets.includes('src/app/dashboard/layout.tsx'));
    assert.ok(targets.includes('src/app/dashboard/loading.tsx'));
    assert.ok(targets.includes('src/components/blocks/dashboard-shell/app-sidebar.tsx'));
    assert.ok(!targets.some((t) => t.includes('dashboard-shell/app/')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
