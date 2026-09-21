import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkVersions, bumpVersion, readProjectVersions } from '../scripts/bump-version.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
).version;


test('F2.2: current repository versions are fully synchronized', () => {
  const result = checkVersions(REPO_ROOT);
  assert.equal(result.synced, true, `Versions are not synced:\n${result.mismatches.join('\n')}`);
  assert.equal(result.targetVersion, MANIFEST_VERSION);
});

test('F2.2: checkVersions flags mismatch when version differs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-bump-test-'));

  try {
    fs.mkdirSync(path.join(tempDir, '.claude-plugin'), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'frontend-kit', version: '0.1.0' })
    );
    fs.writeFileSync(
      path.join(tempDir, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'frontend-kit', version: '0.1.0' }] })
    );
    fs.writeFileSync(
      path.join(tempDir, 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'frontend-kit', version: '0.1.0' }] })
    );
    fs.writeFileSync(
      path.join(tempDir, 'CHANGELOG.md'),
      '# Changelog\n\n## [0.2.0] - 2026-09-16\n'
    );

    const result = checkVersions(tempDir);
    assert.equal(result.synced, false);
    assert.ok(result.mismatches.length > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.2: bumpVersion updates all files and makes them synchronized', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-bump-test-'));

  try {
    fs.mkdirSync(path.join(tempDir, '.claude-plugin'), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'frontend-kit', version: '0.1.0' }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempDir, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'frontend-kit', version: '0.1.0' }] }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempDir, 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'frontend-kit', version: '0.1.0' }] }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempDir, 'CHANGELOG.md'),
      '# Changelog\n\n## [0.1.0] - 2026-09-16\n\n### Added\n- Initial release.\n'
    );

    const bumpRes = bumpVersion(tempDir, '0.2.0');
    assert.equal(bumpRes.synced, true);
    assert.equal(bumpRes.targetVersion, '0.2.0');

    const updatedVersions = readProjectVersions(tempDir);
    assert.equal(updatedVersions.pluginJson, '0.2.0');
    assert.equal(updatedVersions.claudeMarketplace, '0.2.0');
    assert.equal(updatedVersions.rootMarketplace, '0.2.0');
    assert.equal(updatedVersions.changelog, '0.2.0');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
