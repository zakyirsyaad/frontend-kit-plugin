#!/usr/bin/env node
/**
 * scripts/refresh-palettes.mjs
 * Maintainer script to fetch/verify shadcn palette snapshots.
 *
 * Usage:
 *   node scripts/refresh-palettes.mjs          # Fetch, strip radius, sort keys, write JSON
 *   node scripts/refresh-palettes.mjs --check  # Verify local files match remote, exit 1 on drift
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const PALETTE_NAMES = Object.freeze([
  'neutral',
  'zinc',
  'stone',
  'gray',
  'slate',
  'mauve',
  'olive',
  'mist',
  'taupe',
]);

export const SHADCN_CLI_BASE_COLORS = new Set([
  'neutral',
  'zinc',
  'stone',
  'mauve',
  'olive',
  'mist',
  'taupe',
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PALETTES_DIR = path.join(__dirname, 'palettes');

function sortObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

export async function fetchRemotePalette(name) {
  const url = `https://ui.shadcn.com/r/colors/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const cssVars = data.cssVarsV4 || data.inlineColors;
  if (!cssVars || !cssVars.light || !cssVars.dark) {
    throw new Error(`Unexpected structure in ${url}: missing cssVarsV4 light/dark`);
  }

  const light = { ...cssVars.light };
  delete light.radius; // Strip radius from light mode

  const dark = { ...cssVars.dark };

  return {
    name,
    source: `${url}#cssVarsV4`,
    inShadcnCliBaseColors: SHADCN_CLI_BASE_COLORS.has(name),
    light: sortObjectKeys(light),
    dark: sortObjectKeys(dark),
  };
}

export function comparePalettes(local, remote) {
  const diffs = [];

  const checkMode = (mode) => {
    const localKeys = Object.keys(local[mode] || {}).sort();
    const remoteKeys = Object.keys(remote[mode] || {}).sort();

    for (const key of remoteKeys) {
      if (!(key in (local[mode] || {}))) {
        diffs.push(`[${local.name}] ${mode}.${key}: missing locally (remote: ${remote[mode][key]})`);
      } else if (local[mode][key] !== remote[mode][key]) {
        diffs.push(
          `[${local.name}] ${mode}.${key}: '${local[mode][key]}' !== '${remote[mode][key]}'`
        );
      }
    }

    for (const key of localKeys) {
      if (!(key in remote[mode])) {
        diffs.push(`[${local.name}] ${mode}.${key}: extra locally`);
      }
    }
  };

  checkMode('light');
  checkMode('dark');

  return diffs;
}

export async function refreshPalettes(options = {}) {
  const {
    check = false,
    palettesDir = DEFAULT_PALETTES_DIR,
    fetchFn = fetchRemotePalette,
  } = options;

  if (!fs.existsSync(palettesDir) && !check) {
    fs.mkdirSync(palettesDir, { recursive: true });
  }

  let hasDrift = false;
  const allDiffs = [];

  for (const name of PALETTE_NAMES) {
    const filePath = path.join(palettesDir, `${name}.json`);
    const remoteData = await fetchFn(name);

    if (check) {
      if (!fs.existsSync(filePath)) {
        hasDrift = true;
        allDiffs.push(`[${name}] Missing local palette file: ${filePath}`);
        continue;
      }

      let localData;
      try {
        localData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {
        hasDrift = true;
        allDiffs.push(`[${name}] Failed to parse local JSON: ${err.message}`);
        continue;
      }

      const diffs = comparePalettes(localData, remoteData);
      if (diffs.length > 0) {
        hasDrift = true;
        allDiffs.push(...diffs);
      }
    } else {
      const output = {
        name: remoteData.name,
        source: remoteData.source,
        fetched: new Date().toISOString().slice(0, 10),
        inShadcnCliBaseColors: remoteData.inShadcnCliBaseColors,
        light: remoteData.light,
        dark: remoteData.dark,
      };

      fs.writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`);
      console.log(`Updated ${name}.json (${Object.keys(output.light).length} tokens)`);
    }
  }

  if (check) {
    if (hasDrift) {
      console.error(`Drift detected in palettes:\n${allDiffs.join('\n')}`);
      return { success: false, diffs: allDiffs };
    }
    console.log('All 9 palettes are up-to-date and synchronized.');
    return { success: true, diffs: [] };
  }

  return { success: true, diffs: [] };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isCheck = process.argv.includes('--check');
  refreshPalettes({ check: isCheck })
    .then((result) => {
      if (isCheck && !result.success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
