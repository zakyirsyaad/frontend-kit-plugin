import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectItem, parseViewOutput, destinationOf } from '../scripts/inspect-registry-item.mjs';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'registry');
const SCRIPT = path.resolve(import.meta.dirname, '..', 'scripts', 'inspect-registry-item.mjs');

function inspectFixture(id) {
  const [registry, name] = id.slice(1).split('/');
  const raw = fs.readFileSync(path.join(FIXTURES, `${registry}__${name}.json`), 'utf8');
  return inspectItem(parseViewOutput(raw), { itemId: id });
}

const ids = (report) => [...new Set(report.issues.map((i) => i.id))].sort();

// Expected issue ids per recorded item; mirrors the notes in catalog/effects.json.
const EXPECTED = {
  '@magicui/marquee': ['effect-budget', 'missing-reduced-motion'],
  '@magicui/border-beam': ['effect-budget', 'missing-reduced-motion', 'raw-hex'],
  '@magicui/bento-grid': ['effect-budget', 'extra-icon-library', 'palette-class'],
  '@magicui/number-ticker': ['missing-reduced-motion', 'palette-class'],
  '@aceternity/background-beams': ['effect-budget', 'missing-reduced-motion', 'raw-hex'],
  '@aceternity/card-hover-effect': ['effect-budget', 'missing-reduced-motion', 'missing-use-client', 'palette-class'],
  '@aceternity/spotlight': ['effect-budget', 'missing-animation-css', 'missing-reduced-motion'],
  '@aceternity/spotlight-new': ['effect-budget', 'missing-reduced-motion', 'undeclared-dependency'],
  '@aceternity/bento-grid': ['effect-budget', 'extra-icon-library', 'palette-class', 'unused-dependency'],
};

for (const [id, expected] of Object.entries(EXPECTED)) {
  test(`B2.2: ${id} report matches the recorded item`, () => {
    const report = inspectFixture(id);
    assert.deepEqual(ids(report), expected);
    assert.equal(report.verdict, 'needs-adaptation');
    assert.ok(report.license, `${id} should resolve a license from the catalog`);
    assert.ok(report.catalog, `${id} is in the catalog`);
  });
}

test('B2.2: counts, css and dependencies are reported', () => {
  const beams = inspectFixture('@aceternity/background-beams');
  assert.equal(beams.files[0].hex.length, 6);
  assert.equal(beams.license.redistribution.startsWith('not allowed'), true);

  const marquee = inspectFixture('@magicui/marquee');
  assert.deepEqual(marquee.css.themeVars, ['animate-marquee', 'animate-marquee-vertical']);
  assert.deepEqual(marquee.css.rules, ['@keyframes marquee', '@keyframes marquee-vertical']);
  assert.deepEqual(marquee.css.overridesColorTokens, []);
  assert.equal(marquee.license.license, 'MIT');

  const bento = inspectFixture('@magicui/bento-grid');
  assert.deepEqual(bento.registryDependencies, ['button']);
  assert.deepEqual(bento.dependencies.iconLibraries, ['@radix-ui/react-icons']);

  const spotlightNew = inspectFixture('@aceternity/spotlight-new');
  assert.deepEqual(spotlightNew.dependencies.undeclared, ['motion']);

  const ticker = inspectFixture('@magicui/number-ticker');
  assert.equal(ticker.catalog.dashboardOk, true);
  assert.deepEqual(ticker.files[0].paletteClasses.map((c) => c.value), ['text-black', 'dark:text-white']);
});

test('B2.2: dangerous code blocks the item', () => {
  const report = inspectFixture('@fixture/unsafe');
  assert.equal(report.verdict, 'blocked');
  const blocking = report.issues.filter((i) => i.severity === 'block').map((i) => i.id);
  assert.deepEqual(blocking.sort(), ['remote-asset', 'unsafe-code', 'unsafe-code']);
  assert.ok(report.issues.some((i) => i.id === 'unknown-license'));
});

test('B2.2: a clean, token-only item is ok', () => {
  const item = {
    name: 'clean',
    type: 'registry:ui',
    files: [
      {
        path: 'registry/x/clean.tsx',
        type: 'registry:ui',
        content: 'import { cn } from "@/lib/utils"\n\nexport function Clean() {\n  return <div className={cn("bg-card text-muted-foreground")} />\n}\n',
      },
    ],
  };
  const report = inspectItem(item, { itemId: '@magicui/clean' });
  assert.equal(report.verdict, 'ok');
  assert.deepEqual(report.issues, []);
});

test('B2.2: an item that writes kit color tokens is flagged', () => {
  const item = {
    name: 'repaint',
    type: 'registry:ui',
    cssVars: { light: { primary: 'oklch(0.6 0.2 300)' }, theme: { 'animate-x': 'x 1s' } },
    files: [{ path: 'a.tsx', type: 'registry:ui', content: 'export const A = 1\n' }],
  };
  const report = inspectItem(item, { itemId: '@magicui/repaint' });
  assert.deepEqual(report.css.overridesColorTokens, ['primary']);
  assert.ok(report.issues.some((i) => i.id === 'overrides-color-token'));
});

test('B2.2: destinations follow the project folders and file type', () => {
  const dirs = { ui: 'src/components/ui', components: 'src/components', hooks: 'src/hooks', lib: 'src/lib' };
  assert.equal(destinationOf({ path: 'registry/magicui/marquee.tsx', type: 'registry:ui' }, dirs), 'src/components/ui/marquee.tsx');
  assert.equal(destinationOf({ path: 'x/use-thing.ts', type: 'registry:hook' }, dirs), 'src/hooks/use-thing.ts');
  assert.equal(destinationOf({ path: 'x/y.tsx', type: 'registry:component', target: 'components/y.tsx' }, dirs), 'src/components/y.tsx');
});

test('B2.2: the CLI reads a recorded view offline and exits 2 when blocked', () => {
  const ok = execFileSync(process.execPath, [SCRIPT, '@magicui/marquee', '--from-file', path.join(FIXTURES, 'magicui__marquee.json'), '--json'], {
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(ok).item, '@magicui/marquee');

  let status = 0;
  try {
    execFileSync(process.execPath, [SCRIPT, '@fixture/unsafe', '--from-file', path.join(FIXTURES, 'fixture__unsafe.json')], { stdio: 'pipe' });
  } catch (error) {
    status = error.status;
  }
  assert.equal(status, 2);
});

test('B2.2: fixtures hold no original third-party source', () => {
  const readme = fs.readFileSync(path.join(FIXTURES, 'README.md'), 'utf8');
  assert.match(readme, /Not recorded:\*\* file `content`/);
  for (const file of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))) {
    for (const f of JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'))[0].files) {
      assert.ok(f.content.split('\n').length <= 40, `${file}: stand-in content should stay short`);
    }
  }
});
