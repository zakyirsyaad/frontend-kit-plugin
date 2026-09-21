#!/usr/bin/env node
// Read-only status of the Magic UI / Aceternity items recorded in .frontend-kit.json.
//
//   local:    adapted (files match what the adapter wrote) | edited (changed by hand) | missing
//   upstream: same | changed (the registry now serves different code) | unknown   (--live only)
//
// Usage: node check-registry-items.mjs [project-dir] [--live] [--json]

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { localStatus, readRegistryItems, sourceHashOf } from './lib/registry-state.mjs';
import { parseViewOutput } from './inspect-registry-item.mjs';
import { EXIT_CODES } from './lib/fs-safe.mjs';

// `view` is injectable so tests stay offline.
export function checkRegistryItems(projectDir, { view = null } = {}) {
  const resolved = path.resolve(projectDir);
  return readRegistryItems(resolved).map((entry) => {
    const local = localStatus(resolved, entry);
    let upstream = null;
    if (view) {
      try {
        upstream = sourceHashOf(parseViewOutput(view(entry.item))) === entry.sourceHash ? 'same' : 'changed';
      } catch {
        upstream = 'unknown';
      }
    }
    return {
      item: entry.item,
      files: entry.files ?? [],
      installedAt: entry.installedAt ?? null,
      local: local.status,
      missing: local.missing,
      upstream,
      // What upgrade should offer for this item.
      action:
        local.status === 'missing'
          ? 'reinstall'
          : upstream === 'changed'
            ? local.status === 'edited'
              ? 'reinstall-discards-edits'
              : 'reinstall'
            : 'none',
    };
  });
}

async function liveView(projectDir) {
  const { detectProject } = await import('./detect-project.mjs');
  const resolved = path.resolve(projectDir);
  const report = detectProject(resolved, { for: 'doctor' });
  const [bin, ...rest] = (report.packageManager?.commands?.shadcn ?? 'npx shadcn@4').split(' ');
  return (item) =>
    execFileSync(bin, [...rest, 'view', item], {
      cwd: resolved,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const projectDir = args.find((a) => !a.startsWith('--')) ?? '.';
  const view = args.includes('--live') ? await liveView(projectDir) : null;
  const results = checkRegistryItems(projectDir, { view });
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else if (!results.length) {
    console.log('No registry items recorded in .frontend-kit.json.');
  } else {
    for (const r of results) {
      const up = r.upstream ? `, upstream ${r.upstream}` : '';
      console.log(`${r.item}: ${r.local}${up}${r.action !== 'none' ? ` -> ${r.action}` : ''}`);
      for (const m of r.missing) console.log(`  missing ${m}`);
    }
  }
  process.exit(EXIT_CODES.OK);
}
