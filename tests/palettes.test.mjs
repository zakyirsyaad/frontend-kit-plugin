import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PALETTE_NAMES,
  SHADCN_CLI_BASE_COLORS,
  comparePalettes,
} from '../scripts/refresh-palettes.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PALETTES_DIR = path.join(REPO_ROOT, 'scripts', 'palettes');

// OKLCH regex validator: e.g. oklch(0.21 0.006 285.885) or oklch(1 0 0 / 10%)
const OKLCH_REGEX = /^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+(\s*\/\s*[\d.]+%?)?\s*\)$/;

test('F3.2: exactly 9 palette files exist', () => {
  assert.equal(PALETTE_NAMES.length, 9);
  for (const name of PALETTE_NAMES) {
    const filePath = path.join(PALETTES_DIR, `${name}.json`);
    assert.ok(fs.existsSync(filePath), `Palette file missing: ${filePath}`);
  }
});

test('F3.2: each palette has exactly 31 tokens per mode, no radius, valid oklch values', () => {
  for (const name of PALETTE_NAMES) {
    const filePath = path.join(PALETTES_DIR, `${name}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    assert.equal(data.name, name);
    assert.ok(data.source.includes(`https://ui.shadcn.com/r/colors/${name}.json`));
    assert.equal(
      data.inShadcnCliBaseColors,
      SHADCN_CLI_BASE_COLORS.has(name),
      `inShadcnCliBaseColors mismatch for ${name}`
    );

    const lightKeys = Object.keys(data.light).sort();
    const darkKeys = Object.keys(data.dark).sort();

    assert.equal(lightKeys.length, 31, `[${name}] light mode must have exactly 31 tokens`);
    assert.equal(darkKeys.length, 31, `[${name}] dark mode must have exactly 31 tokens`);
    assert.deepEqual(lightKeys, darkKeys, `[${name}] light and dark keys must match`);

    assert.equal(data.light.radius, undefined, `[${name}] light mode must not have radius`);
    assert.equal(data.dark.radius, undefined, `[${name}] dark mode must not have radius`);

    for (const [key, val] of Object.entries(data.light)) {
      assert.ok(
        OKLCH_REGEX.test(val),
        `[${name}] light.${key} '${val}' does not match oklch pattern`
      );
    }

    for (const [key, val] of Object.entries(data.dark)) {
      assert.ok(
        OKLCH_REGEX.test(val),
        `[${name}] dark.${key} '${val}' does not match oklch pattern`
      );
    }
  }
});

test('F3.2: destructive token is identical across all 9 palettes', () => {
  const referencePalette = JSON.parse(
    fs.readFileSync(path.join(PALETTES_DIR, 'zinc.json'), 'utf8')
  );
  const expectedLightDestructive = referencePalette.light.destructive;
  const expectedDarkDestructive = referencePalette.dark.destructive;

  assert.ok(expectedLightDestructive, 'light.destructive must exist');
  assert.ok(expectedDarkDestructive, 'dark.destructive must exist');

  for (const name of PALETTE_NAMES) {
    const data = JSON.parse(
      fs.readFileSync(path.join(PALETTES_DIR, `${name}.json`), 'utf8')
    );
    assert.equal(
      data.light.destructive,
      expectedLightDestructive,
      `[${name}] light.destructive mismatch`
    );
    assert.equal(
      data.dark.destructive,
      expectedDarkDestructive,
      `[${name}] dark.destructive mismatch`
    );
  }
});

test('F3.2: zinc.json matches v0 apply-theme-tokens.mjs values (minus status tokens)', async () => {
  const zincData = JSON.parse(
    fs.readFileSync(path.join(PALETTES_DIR, 'zinc.json'), 'utf8')
  );

  // Status tokens added at runtime, not stored in palette snapshot
  const statusTokenNames = ['status-live', 'status-warning', 'status-error'];

  // Read v0 script to extract LIGHT and DARK object definitions
  const v0Content = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'apply-theme-tokens.mjs'),
    'utf8'
  );

  // Helper to safely parse JS object literal lines into key-value map
  function extractObject(varName) {
    const match = v0Content.match(new RegExp(`const ${varName} = {([\\s\\S]*?)};`));
    assert.ok(match, `Could not find const ${varName} in apply-theme-tokens.mjs`);
    const body = match[1];
    const obj = {};
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const m = trimmed.match(/^["']?([^"':]+)["']?\s*:\s*["']([^"']+)["'],?$/);
      if (m) {
        obj[m[1].trim()] = m[2].trim();
      }
    }
    return obj;
  }

  const v0Light = extractObject('LIGHT');
  const v0Dark = extractObject('DARK');

  for (const token of statusTokenNames) {
    delete v0Light[token];
    delete v0Dark[token];
  }

  assert.deepEqual(
    zincData.light,
    v0Light,
    'zinc.json light tokens must equal v0 LIGHT minus status tokens'
  );
  assert.deepEqual(
    zincData.dark,
    v0Dark,
    'zinc.json dark tokens must equal v0 DARK minus status tokens'
  );
});

test('F3.2: comparePalettes detects differences properly without network', () => {
  const local = {
    name: 'test',
    light: { background: 'oklch(1 0 0)', card: 'oklch(1 0 0)' },
    dark: { background: 'oklch(0 0 0)' },
  };

  const remote = {
    name: 'test',
    light: { background: 'oklch(0.9 0 0)', card: 'oklch(1 0 0)' },
    dark: { background: 'oklch(0 0 0)', extra: 'oklch(0.5 0 0)' },
  };

  const diffs = comparePalettes(local, remote);
  assert.equal(diffs.length, 2);
  assert.ok(diffs.some((d) => d.includes('light.background')));
  assert.ok(diffs.some((d) => d.includes('dark.extra')));
});
