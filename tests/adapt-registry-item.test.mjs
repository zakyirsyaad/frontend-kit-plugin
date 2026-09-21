import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { adaptItem, adaptSource, mapColorClass, componentBodies } from '../scripts/adapt-registry-item.mjs';
import { parseViewOutput } from '../scripts/inspect-registry-item.mjs';
import { reviewScan } from '../scripts/review-scan.mjs';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'registry');
const DIRS = { ui: 'src/components/ui', components: 'src/components', hooks: 'src/hooks', lib: 'src/lib' };

function loadFixture(id) {
  const [registry, name] = id.slice(1).split('/');
  return parseViewOutput(fs.readFileSync(path.join(FIXTURES, `${registry}__${name}.json`), 'utf8'));
}

// A project where `shadcn add` already copied the item's files into src/components/ui.
function installed(ids) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-adapt-'));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  write('.frontend-kit.json', `${JSON.stringify({ kitVersion: '0.3.0', palette: 'zinc' }, null, 2)}\n`);
  write('src/app/page.tsx', 'export default function Page() { return <main className="bg-white text-neutral-900" /> }\n');
  write('src/components/ui/button.tsx', 'export const Button = () => <button className="bg-neutral-100" />\n');
  for (const id of ids) {
    for (const f of loadFixture(id).files) write(`src/components/ui/${path.posix.basename(f.target || f.path)}`, f.content);
  }
  return dir;
}

function snapshot(dir) {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true })
      .map(String)
      .filter((p) => fs.statSync(path.join(dir, p)).isFile())
      .map((p) => [p.replace(/\\/g, '/'), fs.readFileSync(path.join(dir, p), 'utf8')]),
  );
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

test('B2.3: neutral palette classes map to tokens, per mode', () => {
  assert.equal(mapColorClass('bg-white'), 'bg-background');
  assert.equal(mapColorClass('dark:bg-black'), 'dark:bg-background');
  assert.equal(mapColorClass('dark:bg-neutral-950'), 'dark:bg-background');
  assert.equal(mapColorClass('bg-neutral-100'), 'bg-muted');
  assert.equal(mapColorClass('dark:bg-slate-800'), 'dark:bg-muted');
  assert.equal(mapColorClass('text-neutral-700'), 'text-foreground');
  assert.equal(mapColorClass('dark:text-neutral-300'), 'dark:text-foreground');
  assert.equal(mapColorClass('text-neutral-400'), 'text-muted-foreground');
  assert.equal(mapColorClass('border-neutral-200'), 'border-border');
  assert.equal(mapColorClass('dark:border-white/[0.2]'), 'dark:border-border');
  assert.equal(mapColorClass('group-hover:bg-black/[.03]'), 'group-hover:bg-foreground/[.03]');
  assert.equal(mapColorClass('via-black/80'), 'via-foreground/80');
  // No single answer: left alone.
  assert.equal(mapColorClass('bg-black'), null);
  assert.equal(mapColorClass('group-hover:border-slate-700'), null);
  assert.equal(mapColorClass('bg-sky-500'), null);
  assert.equal(mapColorClass('bg-background'), null);
});

test('B2.3: dark twins collapse once both sides map to the same token', () => {
  const { content } = adaptSource('const a = "bg-white dark:bg-black text-neutral-700 dark:text-neutral-300"\n');
  assert.equal(content, 'const a = "bg-background text-foreground"\n');
});

test('B2.3: adapting an installed item rewrites only its files and records it', () => {
  const dir = installed(['@aceternity/card-hover-effect']);
  try {
    const before = snapshot(dir);
    const res = adaptItem(loadFixture('@aceternity/card-hover-effect'), dir, { itemId: '@aceternity/card-hover-effect', dirs: DIRS });
    const after = snapshot(dir);
    const touched = Object.keys(after).filter((k) => after[k] !== before[k]);
    const added = touched.filter((k) => !(k in before));
    assert.deepEqual(
      touched.filter((k) => !k.startsWith('.frontend-kit/backup/')).sort(),
      ['.frontend-kit.json', 'src/components/ui/card-hover-effect.tsx'],
    );
    assert.ok(added.every((k) => k.startsWith('.frontend-kit/backup/')), 'only backups may be new files');

    const code = read(dir, 'src/components/ui/card-hover-effect.tsx');
    assert.ok(code.startsWith('"use client"'));
    assert.match(code, /<MotionConfig reducedMotion="user">/);
    assert.match(code, /import \{ AnimatePresence, MotionConfig, motion \} from "motion\/react"/);
    assert.doesNotMatch(code, /neutral-|slate-|zinc-\d/);

    const state = JSON.parse(read(dir, '.frontend-kit.json'));
    assert.equal(state.palette, 'zinc', 'existing state is kept');
    const [entry] = state.registryItems;
    assert.equal(entry.item, '@aceternity/card-hover-effect');
    assert.equal(entry.registry, '@aceternity');
    assert.deepEqual(entry.files, ['src/components/ui/card-hover-effect.tsx']);
    assert.match(entry.sourceHash, /^[0-9a-f]{64}$/);
    assert.match(entry.adaptedHash, /^[0-9a-f]{64}$/);
    assert.match(entry.installedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(entry.adaptations, ['palette-class', 'reduced-motion-config', 'use-client']);
    assert.equal(res.state.changed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.3: a second run changes nothing (idempotent)', () => {
  const ids = ['@magicui/marquee', '@magicui/border-beam', '@aceternity/background-beams', '@aceternity/card-hover-effect', '@aceternity/spotlight'];
  const dir = installed(ids);
  try {
    for (const id of ids) adaptItem(loadFixture(id), dir, { itemId: id, dirs: DIRS });
    const first = snapshot(dir);
    for (const id of ids) {
      const res = adaptItem(loadFixture(id), dir, { itemId: id, dirs: DIRS });
      assert.ok(res.files.every((f) => !f.changed), `${id} changed on the second run`);
      assert.equal(res.state.changed, false, `${id} rewrote .frontend-kit.json on the second run`);
    }
    assert.deepEqual(snapshot(dir), first);
    const state = JSON.parse(read(dir, '.frontend-kit.json'));
    assert.deepEqual(state.registryItems.map((r) => r.item), [...ids].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.3: each fix matches the kind of effect', () => {
  const dir = installed(['@magicui/marquee', '@aceternity/background-beams', '@magicui/bento-grid', '@magicui/number-ticker']);
  try {
    const run = (id) => adaptItem(loadFixture(id), dir, { itemId: id, dirs: DIRS });

    run('@magicui/marquee');
    assert.match(read(dir, 'src/components/ui/marquee.tsx'), /animate-marquee motion-reduce:animate-none/);

    run('@aceternity/background-beams');
    const beams = read(dir, 'src/components/ui/background-beams.tsx');
    // Hidden by CSS, not by returning null: the server and client DOM stay identical.
    assert.match(beams, /return \(\n\s+<div className="contents motion-reduce:hidden">/);
    assert.doesNotMatch(beams, /return null/);
    assert.doesNotMatch(beams, /#[0-9a-fA-F]{3,8}\b/);
    assert.match(beams, /stopColor="var\(--chart-1\)"/);

    const magic = run('@magicui/bento-grid');
    const bento = read(dir, 'src/components/ui/bento-grid.tsx');
    assert.match(bento, /^import \{ ArrowRightIcon \} from "lucide-react"/);
    assert.doesNotMatch(bento, /@radix-ui\/react-icons/);
    assert.deepEqual(magic.removableDependencies, ['@radix-ui/react-icons']);

    const ticker = run('@magicui/number-ticker');
    assert.ok(ticker.leftovers.some((l) => l.includes('final value')), 'content effects are left for a person');
    assert.doesNotMatch(read(dir, 'src/components/ui/number-ticker.tsx'), /useReducedMotion/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.3: declared-but-unused packages are offered for removal', () => {
  const dir = installed(['@aceternity/bento-grid']);
  try {
    const res = adaptItem(loadFixture('@aceternity/bento-grid'), dir, { itemId: '@aceternity/bento-grid', dirs: DIRS });
    assert.deepEqual(res.removableDependencies, ['@tabler/icons-react']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.3: --dry-run writes nothing, including state', () => {
  const dir = installed(['@magicui/border-beam']);
  try {
    const before = snapshot(dir);
    const res = adaptItem(loadFixture('@magicui/border-beam'), dir, { itemId: '@magicui/border-beam', dirs: DIRS, dryRun: true });
    assert.deepEqual(snapshot(dir), before);
    assert.ok(res.files[0].changed && res.files[0].diff.includes('var(--chart-1)'));
    assert.equal(res.state.changed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.3: blocked and not-installed items are refused', () => {
  const dir = installed([]);
  try {
    const before = snapshot(dir);
    assert.equal(adaptItem(loadFixture('@fixture/unsafe'), dir, { itemId: '@fixture/unsafe', dirs: DIRS }).blocked, true);
    assert.deepEqual(adaptItem(loadFixture('@magicui/marquee'), dir, { itemId: '@magicui/marquee', dirs: DIRS }).missing, [
      'src/components/ui/marquee.tsx',
    ]);
    assert.deepEqual(snapshot(dir), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.3: adapted files pass the kit review for the rules the adapter owns', () => {
  const ids = ['@magicui/border-beam', '@aceternity/background-beams', '@aceternity/card-hover-effect', '@magicui/marquee'];
  const dir = installed(ids);
  try {
    for (const id of ids) adaptItem(loadFixture(id), dir, { itemId: id, dirs: DIRS });
    const files = ids.map((id) => `src/components/ui/${id.split('/')[1]}.tsx`);
    const { findings } = reviewScan(dir, files, { projectChecks: false });
    const owned = new Set(['raw-color-class', 'missing-reduced-motion', 'framer-motion-import', 'slop-mixed-icons']);
    assert.deepEqual(findings.filter((f) => owned.has(f.id)), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.4: component bodies are found in the export shapes registries actually use', () => {
  const names = (src) => componentBodies(src).map((b) => b.name);
  // Shapes seen in @aceternity/background-beams, @magicui/border-beam, @magicui/number-ticker.
  assert.deepEqual(names('export const A = React.memo(\n  ({ c }: { c?: string }) => {\n    return <div />\n  }\n)\n'), ['A']);
  assert.deepEqual(names('export const B = ({\n  size = 50,\n  onDone,\n}: { size?: number; onDone?: () => void }) => {\n  return <div />\n}\n'), ['B']);
  assert.deepEqual(names('export function C({ v }: { v: number }): React.ReactNode {\n  return <span />\n}\n'), ['C']);
  assert.deepEqual(names('export function D<T>({ items }: { items: T[] }) {\n  return null\n}\n'), ['D']);
  assert.deepEqual(names('export const E = React.forwardRef<HTMLDivElement, P>((props, ref) => {\n  return <div ref={ref} />\n})\n'), ['E']);
  // A concise arrow has no body to insert into: reported, not guessed.
  assert.deepEqual(names('export const F = ({ a }: { a: string }) => <span>{a}</span>\n'), []);
  const { leftovers } = adaptSource('import { motion } from "motion/react"\nexport const F = () => <motion.div />\n', { kind: 'ambient' });
  assert.ok(leftovers.some((l) => l.includes('by hand')));
});

test('B2.4: the use client directive follows the file semicolon style', () => {
  const semi = 'import { useState } from "react";\n\nexport const A = () => {\n  const [x] = useState(0);\n  return <div>{x}</div>;\n};\n';
  assert.match(adaptSource(semi, { needsClient: true }).content, /^"use client";\n/);
  assert.match(adaptSource(semi.replaceAll(';', ''), { needsClient: true }).content, /^"use client"\n/);
});

test('B2.4: effects that carry content stay visible under reduced motion', () => {
  const src = 'import { motion } from "motion/react"\n\nexport function Shimmer({ children }: { children: React.ReactNode }) {\n  return <motion.button animate={{ x: [0, 4] }}>{children}</motion.button>\n}\n';
  for (const kind of ['accent', 'loop', 'interaction', null]) {
    const { content, leftovers } = adaptSource(src, { kind, needsClient: true });
    assert.match(content, /<MotionConfig reducedMotion="user">/, `${kind}: keeps the content, stops the movement`);
    assert.doesNotMatch(content, /motion-reduce:hidden/, `${kind}: must not hide content`);
    assert.ok(leftovers.some((l) => l.includes('transform and layout animations only')));
  }
  const ambient = adaptSource(src, { kind: 'ambient', needsClient: true }).content;
  assert.match(ambient, /motion-reduce:hidden/);
  assert.doesNotMatch(ambient, /MotionConfig/);
});
