#!/usr/bin/env node
// Weekly drift check for catalog/effects.json (run by .github/workflows/drift.yml).
//
// For every catalog candidate it asks the registry for the item (`shadcn view`) and runs the
// same inspection the effects skill runs. It fails when an item is gone, or when the live item
// no longer reports the same issues as its recorded fixture in tests/fixtures/registry/ — the
// sign that the catalog notes and the adapter tests describe code that has changed upstream.
//
// Usage: node check-catalog.mjs [--json]   (needs network; `view` is injectable for tests)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectItem, parseViewOutput, loadCatalog } from './inspect-registry-item.mjs';
import { EXIT_CODES } from './lib/fs-safe.mjs';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '..', 'tests', 'fixtures', 'registry');

const issueIds = (report) => [...new Set(report.issues.map((i) => i.id))].sort();

export function fixturePathFor(item, fixturesDir = FIXTURES_DIR) {
  const [registry, name] = item.slice(1).split('/');
  return path.join(fixturesDir, `${registry}__${name}.json`);
}

export function checkCatalog({ view, catalog = loadCatalog(), fixturesDir = FIXTURES_DIR } = {}) {
  const items = catalog.needs.flatMap((n) => n.candidates.map((c) => c.item));
  return items.map((item) => {
    let live;
    try {
      live = issueIds(inspectItem(parseViewOutput(view(item)), { itemId: item, catalog }));
    } catch (error) {
      return { item, available: false, error: String(error.message ?? error).split('\n')[0], fixture: 'none' };
    }
    const fixturePath = fixturePathFor(item, fixturesDir);
    if (!fs.existsSync(fixturePath)) return { item, available: true, issues: live, fixture: 'none' };
    const recorded = issueIds(inspectItem(parseViewOutput(fs.readFileSync(fixturePath, 'utf8')), { itemId: item, catalog }));
    const onlyLive = live.filter((id) => !recorded.includes(id));
    const onlyFixture = recorded.filter((id) => !live.includes(id));
    return {
      item,
      available: true,
      issues: live,
      fixture: onlyLive.length || onlyFixture.length ? 'differs' : 'match',
      onlyLive,
      onlyFixture,
    };
  });
}

export function failures(results) {
  return results.filter((r) => !r.available || r.fixture === 'differs');
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const json = process.argv.includes('--json');
  const view = (item) =>
    execFileSync('npx', ['--yes', 'shadcn@4', 'view', item], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  const results = checkCatalog({ view });
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (!r.available) console.log(`✘ ${r.item}: not available (${r.error})`);
      else if (r.fixture === 'differs') {
        console.log(`✘ ${r.item}: live issues differ from the fixture (live only: ${r.onlyLive.join(', ') || '-'}; fixture only: ${r.onlyFixture.join(', ') || '-'})`);
      } else console.log(`✔ ${r.item}: ${r.issues.join(', ') || 'no issues'}${r.fixture === 'match' ? ' (matches fixture)' : ''}`);
    }
  }
  const failed = failures(results);
  if (failed.length && !json) {
    console.log(`\n${failed.length} catalog item(s) drifted: update catalog/effects.json notes and the fixture, then the adapter tests.`);
  }
  process.exit(failed.length ? EXIT_CODES.FIXABLE : EXIT_CODES.OK);
}
