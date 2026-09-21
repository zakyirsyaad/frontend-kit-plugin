import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CATALOG_PATH = path.resolve(import.meta.dirname, '..', 'catalog', 'effects.json');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

test('B2.1: catalog header is complete', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.match(catalog.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(catalog.checkedWith.startsWith('shadcn@'));
  for (const [name, reg] of Object.entries(catalog.registries)) {
    assert.match(name, /^@[a-z0-9-]+$/);
    assert.ok(reg.license && reg.source && reg.redistribution, `${name} needs license, source and redistribution`);
  }
});

test('B2.1: every need is well-formed and uses a known kind', () => {
  const ids = new Set();
  for (const need of catalog.needs) {
    assert.match(need.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(!ids.has(need.id), `duplicate need ${need.id}`);
    ids.add(need.id);
    assert.ok(need.label, `${need.id} needs a label`);
    assert.ok(need.kind in catalog.kinds, `${need.id} has unknown kind ${need.kind}`);
    assert.equal(typeof need.dashboardOk, 'boolean');
    assert.ok(need.candidates.length >= 1 && need.candidates.length <= 3, `${need.id} should offer 1-3 candidates`);
  }
});

test('B2.1: candidates name registry items and carry notes only', () => {
  const seen = new Set();
  for (const need of catalog.needs) {
    for (const c of need.candidates) {
      const [registry] = c.item.split('/');
      assert.match(c.item, /^@[a-z0-9-]+\/[a-z0-9-]+$/);
      assert.ok(registry in catalog.registries, `${c.item} uses an unlisted registry`);
      assert.ok(!seen.has(c.item), `${c.item} is listed twice`);
      seen.add(c.item);
      assert.ok(typeof c.fit === 'string' && c.fit.length > 0);
      assert.ok(Array.isArray(c.issues));
      assert.deepEqual(Object.keys(c).sort(), ['fit', 'issues', 'item'], `${c.item} has unexpected fields`);
    }
  }
});

test('B2.1: the catalog stores no component code', () => {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  // Code would show up as imports, JSX or function bodies; notes may mention class names.
  assert.doesNotMatch(raw, /\bimport\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+\\?["']/);
  assert.doesNotMatch(raw, /<[A-Za-z][\w.]*[\s>/]/);
  assert.doesNotMatch(raw, /=>\s*[{(]|\bfunction\s+\w+\s*\(/);
  assert.ok(raw.length < 20000, 'catalog should stay a short list of notes');
});

test('B2.1: only the metric ticker is allowed on dashboards', () => {
  const allowed = catalog.needs.filter((n) => n.dashboardOk).map((n) => n.id);
  assert.deepEqual(allowed, ['metric-ticker']);
});
