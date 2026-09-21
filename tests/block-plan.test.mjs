import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listBlocks, planBlock, parseDependency, routeFromAppFile } from '../scripts/block-plan.mjs';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-block-plan-'));
  const base = {
    'package.json': JSON.stringify({
      name: 'app',
      scripts: { lint: 'eslint', build: 'next build' },
      dependencies: { next: '16.0.0', react: '19.0.0', tailwindcss: '^4.0.0' },
    }),
    'bun.lock': '',
    'src/app/layout.tsx': '',
    'src/app/globals.css': '@import "tailwindcss";\n',
    'components.json': JSON.stringify({
      style: 'radix-nova',
      tailwind: { css: 'src/app/globals.css', baseColor: 'zinc' },
      aliases: { components: '@/components', ui: '@/components/ui', utils: '@/lib/utils' },
    }),
    'src/components/ui/button.tsx': '',
    'src/components/ui/card.tsx': '',
  };
  for (const [rel, content] of Object.entries({ ...base, ...files })) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

function snapshot(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .sort()
    .map((p) => {
      const full = path.join(dir, p);
      return fs.statSync(full).isFile() ? `${p}:${fs.readFileSync(full, 'utf8').length}` : p;
    });
}

test('B1.3: helpers parse dependency specs and app routes', () => {
  assert.deepEqual(parseDependency('@tanstack/react-table@^9'), { name: '@tanstack/react-table', range: '^9' });
  assert.deepEqual(parseDependency('@hookform/resolvers'), { name: '@hookform/resolvers', range: null });
  assert.deepEqual(parseDependency('zod'), { name: 'zod', range: null });
  assert.equal(routeFromAppFile('app/dashboard/page.tsx'), '/dashboard');
  assert.equal(routeFromAppFile('app/(marketing)/pricing/page.tsx'), '/pricing');
  assert.equal(routeFromAppFile('app/dashboard/loading.tsx'), null);
  assert.equal(routeFromAppFile('hero.tsx'), null);
});

test('B1.3: --list returns every block with its needs', () => {
  const names = listBlocks().map((b) => b.name);
  assert.deepEqual(names, ['chart-card', 'dashboard-shell', 'data-table', 'form', 'landing-sections', 'state-panel']);
});

test('B1.3: plan lists only what is missing and uses the project package manager', () => {
  const dir = project({});
  try {
    const before = snapshot(dir);
    const plan = planBlock('form', dir);
    assert.deepEqual(plan.stops, []);
    assert.deepEqual(plan.shadcn.missing, ['field', 'input', 'textarea', 'select']);
    assert.deepEqual(plan.dependencies.missing, ['react-hook-form', 'zod', '@hookform/resolvers']);
    assert.equal(plan.packageManager, 'bun');
    assert.equal(plan.commands.shadcnAdd, 'bunx --bun shadcn@4 add field input textarea select -y');
    assert.equal(plan.commands.addDependencies, 'bun add react-hook-form zod @hookform/resolvers');
    assert.equal(plan.commands.build, 'bun run build');
    assert.ok(plan.files.every((f) => f.status === 'create'));
    assert.equal(plan.nothingToDo, false);
    assert.deepEqual(snapshot(dir), before, 'planning must not write');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B1.3: route blocks report the route to open, and conflicts are flagged', () => {
  const dir = project({ 'src/app/dashboard/page.tsx': 'export default function Mine() { return null }\n' });
  try {
    const plan = planBlock('dashboard-shell', dir);
    assert.deepEqual(plan.verify.routes, ['/dashboard']);
    const page = plan.files.find((f) => f.target === 'src/app/dashboard/page.tsx');
    assert.equal(page.status, 'conflict');
    assert.ok(plan.warnings.some((w) => w.includes('src/app/dashboard/page.tsx')));
    assert.ok(plan.verify.reviewFiles.includes('src/components/blocks/dashboard-shell/app-sidebar.tsx'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B1.3: an installed dependency on another major version is a warning, not a reinstall', () => {
  const dir = project({
    'package.json': JSON.stringify({
      name: 'app',
      dependencies: { next: '16.0.0', react: '19.0.0', tailwindcss: '^4.0.0', 'lucide-react': '^1.0.0', '@tanstack/react-table': '^8.21.0' },
    }),
  });
  try {
    const plan = planBlock('data-table', dir);
    assert.deepEqual(plan.dependencies.missing, []);
    assert.ok(plan.warnings.some((w) => w.includes('@tanstack/react-table') && w.includes('^9')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B1.3: unsupported projects stop before any file is planned', () => {
  const noShadcn = project({ 'components.json': null });
  const tw3 = project({
    'package.json': JSON.stringify({ name: 'app', dependencies: { next: '15.0.0', react: '19.0.0', tailwindcss: '^3.4.0' } }),
  });
  try {
    const a = planBlock('state-panel', noShadcn);
    assert.ok(a.stops.some((s) => s.code === 'NO_SHADCN'));
    assert.deepEqual(a.files, []);
    const b = planBlock('state-panel', tw3);
    assert.ok(b.stops.some((s) => s.code === 'TAILWIND_V3'));
    assert.equal(planBlock('nope', noShadcn).stops[0].code, 'UNKNOWN_BLOCK');
    assert.equal(planBlock('../etc', noShadcn).stops[0].code, 'UNKNOWN_BLOCK');
  } finally {
    fs.rmSync(noShadcn, { recursive: true, force: true });
    fs.rmSync(tw3, { recursive: true, force: true });
  }
});

test('fix: a project on another icon library gets lucide-react added and a warning', () => {
  const dir = project({
    'components.json': JSON.stringify({
      style: 'radix-lyra',
      iconLibrary: 'phosphor',
      tailwind: { css: 'src/app/globals.css' },
      aliases: { components: '@/components', ui: '@/components/ui' },
    }),
  });
  try {
    const plan = planBlock('data-table', dir);
    assert.ok(plan.dependencies.missing.includes('lucide-react'));
    assert.ok(plan.warnings.some((w) => w.includes('phosphor') && w.includes('second icon set')));
    // form imports no icons, so nothing changes for it.
    assert.ok(!planBlock('form', dir).dependencies.missing.includes('lucide-react'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
