import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkCatalog, failures, fixturePathFor } from '../scripts/check-catalog.mjs';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures', 'registry');

// Offline stand-in for `shadcn view`: serves the recorded fixture when there is one,
// and a minimal clean item otherwise.
function recordedView(item) {
  const file = fixturePathFor(item, FIXTURES);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  return JSON.stringify([{ name: item.split('/')[1], type: 'registry:ui', files: [{ path: 'x.tsx', type: 'registry:ui', content: 'export const X = 1\n' }] }]);
}

test('drift: every catalog item is checked, and recorded fixtures match themselves', () => {
  const results = checkCatalog({ view: recordedView });
  const catalog = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'catalog', 'effects.json'), 'utf8'));
  assert.equal(results.length, catalog.needs.flatMap((n) => n.candidates).length);
  assert.deepEqual(failures(results), []);
  assert.ok(results.filter((r) => r.fixture === 'match').length >= 9, 'items with fixtures are compared');
});

test('drift: a removed item and a changed item both fail the check', () => {
  const view = (item) => {
    if (item === '@magicui/marquee') throw new Error('item not found');
    if (item === '@aceternity/background-beams') {
      // Upstream now ships reduced-motion handling and no hex colors.
      const changed = JSON.parse(recordedView(item));
      changed[0].files[0].content = '"use client"\nimport { motion, useReducedMotion } from "motion/react"\nexport const B = () => <motion.div />\n';
      return JSON.stringify(changed);
    }
    return recordedView(item);
  };
  const byItem = Object.fromEntries(checkCatalog({ view }).map((r) => [r.item, r]));
  assert.equal(byItem['@magicui/marquee'].available, false);
  assert.equal(byItem['@aceternity/background-beams'].fixture, 'differs');
  assert.deepEqual(byItem['@aceternity/background-beams'].onlyFixture, ['missing-reduced-motion', 'raw-hex']);
  assert.deepEqual(failures(Object.values(byItem)).map((r) => r.item).sort(), ['@aceternity/background-beams', '@magicui/marquee']);
});
