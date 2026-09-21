import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { reviewScan, formatReport } from '../scripts/review-scan.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'review');

// One violation per rule id. Golden list: a rule that stops firing is a
// regression, and a rule that fires on good-component.tsx is a false positive.
const EXPECTED_IDS = [
  'dynamic-token-class',
  'gsap-in-useeffect',
  'missing-reduced-motion',
  'next-font-google',
  'raw-color-class',
  'registry-unsafe-eval',
  'size-shorthand',
  'slop-black-shadow',
  'slop-default-purple',
  'slop-emoji-icon',
  'slop-gradient-text',
  'slop-mixed-icons',
  'slop-mixed-radius',
  'slop-nested-card',
  'status-color-no-label',
  'three-in-server-component',
];

test('A3.1: bad-component.tsx triggers every rule id exactly once or more', () => {
  const result = reviewScan(FIXTURES, ['bad-component.tsx'], { projectChecks: false });
  const found = new Set(result.findings.map((f) => f.id));
  for (const id of EXPECTED_IDS) {
    assert.ok(found.has(id), `expected ${id} to fire on the bad fixture`);
  }
  assert.strictEqual(result.verdict, 'fail', 'an error-level finding fails the verdict');
  assert.ok(result.counts.error >= 2, 'dynamic-token-class and gsap-in-useeffect are errors');
});

test('A3.1: good-component.tsx produces zero findings', () => {
  const result = reviewScan(FIXTURES, ['good-component.tsx'], { projectChecks: false });
  assert.deepStrictEqual(
    result.findings.map((f) => `${f.id}:${f.line}`),
    [],
    'token-based, labelled, reduced-motion-aware code must be clean'
  );
  assert.strictEqual(result.verdict, 'pass');
});

test('A3.1: findings carry file, line, severity, category and a fix', () => {
  const result = reviewScan(FIXTURES, ['bad-component.tsx'], { projectChecks: false });
  for (const f of result.findings) {
    assert.ok(f.file.endsWith('bad-component.tsx'));
    assert.ok(Number.isInteger(f.line) && f.line >= 1, `${f.id} has a real line number`);
    assert.ok(['error', 'warning', 'info'].includes(f.severity));
    assert.ok(['kit-rule', 'ai-slop', 'third-party'].includes(f.category));
    assert.ok(f.fix && f.fix.length > 10, `${f.id} explains the fix`);
  }
});

test('A3.1: the accent recorded in .frontend-kit.json silences slop-default-purple', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-scan-accent-'));
  try {
    const component = 'export function A() {\n  return <div className="bg-violet-600 p-4">Brand</div>;\n}\n';
    fs.writeFileSync(path.join(tmpDir, 'a.tsx'), component);

    const withoutAccent = reviewScan(tmpDir, ['a.tsx'], { projectChecks: false });
    assert.ok(withoutAccent.findings.some((f) => f.id === 'slop-default-purple'));

    fs.writeFileSync(
      path.join(tmpDir, '.frontend-kit.json'),
      `${JSON.stringify({ kitVersion: '0.2.0', palette: 'zinc', accent: 'violet' }, null, 2)}\n`
    );
    const withAccent = reviewScan(tmpDir, ['a.tsx'], { projectChecks: false });
    assert.ok(
      !withAccent.findings.some((f) => f.id === 'slop-default-purple'),
      'a deliberate violet accent is not slop'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('A3.1: missing route boundaries are reported once per project', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-scan-bounds-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src', 'app'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'app', 'page.tsx'), 'export default function P() { return null; }\n');

    const before = reviewScan(tmpDir, ['src/app/page.tsx']);
    const boundary = before.findings.filter((f) => f.id === 'missing-route-boundaries');
    assert.strictEqual(boundary.length, 1);
    assert.match(boundary[0].message, /error\.tsx/);

    for (const file of ['error.tsx', 'loading.tsx', 'not-found.tsx']) {
      fs.writeFileSync(path.join(tmpDir, 'src', 'app', file), 'export default function B() { return null; }\n');
    }
    const after = reviewScan(tmpDir, ['src/app/page.tsx']);
    assert.ok(!after.findings.some((f) => f.id === 'missing-route-boundaries'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('A3.1: the report groups findings by severity and lists what was skipped', () => {
  const result = reviewScan(FIXTURES, ['bad-component.tsx', 'does-not-exist.tsx'], { projectChecks: false });
  const report = formatReport(result);
  assert.match(report, /^Verdict: fail/m);
  assert.match(report, /## Errors/);
  assert.match(report, /\[gsap-in-useeffect\] \(kit-rule\)/);
  assert.match(report, /Not checked: does-not-exist\.tsx \(not found\)/);
});

test('B2.4: effects budget — one ambient background per file, no decoration on app routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-review-effects-'));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(tmpDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, rel), content);
  };
  try {
    write('src/app/page.tsx', [
      'import { BackgroundBeams } from "@/components/ui/background-beams"',
      'import { Spotlight } from "@/components/ui/spotlight-new"',
      'export default function Page() { return <main><BackgroundBeams /><Spotlight /></main> }',
      '',
    ].join('\n'));
    write('src/app/one/page.tsx', [
      'import { BackgroundBeams } from "@/components/ui/background-beams"',
      'import { Marquee } from "@/components/ui/marquee"',
      'export default function Page() { return <main><BackgroundBeams /><Marquee /></main> }',
      '',
    ].join('\n'));
    write('src/app/dashboard/page.tsx', [
      'import { Marquee } from "@/components/ui/marquee"',
      'import { NumberTicker } from "@/components/ui/number-ticker"',
      'export default function Page() { return <main><Marquee /><NumberTicker value={3} /></main> }',
      '',
    ].join('\n'));
    // A package with the same last segment is not an installed effect.
    write('src/app/other/page.tsx', 'import { marquee } from "some-lib/marquee"\nexport default function Page() { return null }\n');

    const result = reviewScan(tmpDir, [
      'src/app/page.tsx',
      'src/app/one/page.tsx',
      'src/app/dashboard/page.tsx',
      'src/app/other/page.tsx',
    ], { projectChecks: false });
    const by = (id) => result.findings.filter((f) => f.id === id).map((f) => `${f.file}:${f.line}`);

    assert.deepEqual(by('effect-budget-ambient'), ['src/app/page.tsx:2']);
    assert.deepEqual(by('effect-in-dashboard'), ['src/app/dashboard/page.tsx:1']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('B2.4: recorded registry items decide which file is which effect', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-review-effects-state-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src/app/(app)'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.frontend-kit.json'), JSON.stringify({
      registryItems: [{ item: '@magicui/border-beam', files: ['src/components/ui/glow-edge.tsx'] }],
    }));
    fs.writeFileSync(path.join(tmpDir, 'src/app/(app)/page.tsx'),
      'import { BorderBeam } from "@/components/ui/glow-edge"\nexport default function Page() { return <BorderBeam /> }\n');
    const result = reviewScan(tmpDir, ['src/app/(app)/page.tsx'], { projectChecks: false });
    assert.deepEqual(result.findings.filter((f) => f.id === 'effect-in-dashboard').map((f) => f.line), [1]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('B2.4: a class list read as both attribute and cn() call is reported once', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-review-dedupe-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.tsx'), 'export const A = () => <div className={cn("flex w-full h-full")} />\n');
    const result = reviewScan(tmpDir, ['a.tsx'], { projectChecks: false });
    assert.equal(result.findings.filter((f) => f.id === 'size-shorthand').length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
