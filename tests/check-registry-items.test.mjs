import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkRegistryItems } from '../scripts/check-registry-items.mjs';
import { adaptItem } from '../scripts/adapt-registry-item.mjs';
import { parseViewOutput } from '../scripts/inspect-registry-item.mjs';
import { detectProject } from '../scripts/detect-project.mjs';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'registry');
const DIRS = { ui: 'src/components/ui', components: 'src/components', hooks: 'src/hooks', lib: 'src/lib' };
const raw = (id) => {
  const [registry, name] = id.slice(1).split('/');
  return fs.readFileSync(path.join(FIXTURES, `${registry}__${name}.json`), 'utf8');
};

// A kit project with two effects installed and adapted, as /frontend-kit:effects leaves it.
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-registry-state-'));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  write('package.json', JSON.stringify({ name: 'app', dependencies: { next: '16.0.0', react: '19.0.0', tailwindcss: '^4.0.0' } }));
  write('components.json', JSON.stringify({ style: 'radix-nova', tailwind: { css: 'src/app/globals.css' }, aliases: { components: '@/components' } }));
  write('src/app/layout.tsx', '');
  write('.frontend-kit.json', `${JSON.stringify({ kitVersion: '0.3.0', palette: 'zinc' }, null, 2)}\n`);
  for (const id of ['@magicui/marquee', '@aceternity/background-beams']) {
    const item = parseViewOutput(raw(id));
    for (const f of item.files) write(`src/components/ui/${path.posix.basename(f.target || f.path)}`, f.content);
    adaptItem(item, dir, { itemId: id, dirs: DIRS });
  }
  return dir;
}

const byItem = (results) => Object.fromEntries(results.map((r) => [r.item, r]));

test('B3: freshly adapted items read as adapted, and checking writes nothing', () => {
  const dir = project();
  try {
    const before = fs.readFileSync(path.join(dir, '.frontend-kit.json'), 'utf8');
    const results = byItem(checkRegistryItems(dir));
    assert.equal(results['@magicui/marquee'].local, 'adapted');
    assert.equal(results['@aceternity/background-beams'].local, 'adapted');
    assert.equal(results['@magicui/marquee'].upstream, null, 'no registry contact without --live');
    assert.equal(fs.readFileSync(path.join(dir, '.frontend-kit.json'), 'utf8'), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B3 / EF6: doctor spots a hand edit and a deleted file', () => {
  const dir = project();
  try {
    const file = path.join(dir, 'src/components/ui/marquee.tsx');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('[--gap:1rem]', '[--gap:2rem]'));
    fs.rmSync(path.join(dir, 'src/components/ui/background-beams.tsx'));

    const report = detectProject(dir, { for: 'doctor' }).doctorReport;
    const items = byItem(report.registryItems);
    assert.equal(items['@magicui/marquee'].status, 'edited');
    assert.equal(items['@aceternity/background-beams'].status, 'missing');
    assert.deepEqual(items['@aceternity/background-beams'].missing, ['src/components/ui/background-beams.tsx']);
    assert.ok(report.suggestedCommands.includes('/frontend-kit:effects'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B3: upstream changes decide what upgrade offers', () => {
  const dir = project();
  try {
    // The registry still serves marquee unchanged, but beams changed upstream.
    const view = (item) => {
      if (item === '@magicui/marquee') return raw(item);
      const changed = JSON.parse(raw(item));
      changed[0].files[0].content += '\n// upstream fix\n';
      return JSON.stringify(changed);
    };
    let results = byItem(checkRegistryItems(dir, { view }));
    assert.equal(results['@magicui/marquee'].upstream, 'same');
    assert.equal(results['@magicui/marquee'].action, 'none');
    assert.equal(results['@aceternity/background-beams'].upstream, 'changed');
    assert.equal(results['@aceternity/background-beams'].action, 'reinstall');

    // A hand-edited copy must not be replaced silently.
    const beams = path.join(dir, 'src/components/ui/background-beams.tsx');
    fs.appendFileSync(beams, '\n// local tweak\n');
    results = byItem(checkRegistryItems(dir, { view }));
    assert.equal(results['@aceternity/background-beams'].action, 'reinstall-discards-edits');

    // An unreachable registry is reported, not treated as a change.
    results = byItem(checkRegistryItems(dir, { view: () => { throw new Error('offline'); } }));
    assert.equal(results['@magicui/marquee'].upstream, 'unknown');
    assert.equal(results['@magicui/marquee'].action, 'none');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B3: projects without recorded items report nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-registry-none-'));
  try {
    assert.deepEqual(checkRegistryItems(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
