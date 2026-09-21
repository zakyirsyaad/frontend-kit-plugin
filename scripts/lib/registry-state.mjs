// Hashes and status for third-party registry items recorded in .frontend-kit.json
// (registryItems[]). Shared by adapt-registry-item, detect-project (doctor) and
// check-registry-items (upgrade) so all three compute the same thing.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function hashContents(parts) {
  return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

// Hash of the item as the registry serves it (paths + content), to spot upstream changes.
export function sourceHashOf(item) {
  return hashContents(item.files.map((f) => `${f.path}\n${f.content ?? ''}`));
}

// adapted: files match what the adapter wrote; edited: changed by hand since; missing: a file is gone.
export function localStatus(projectDir, entry) {
  const files = entry.files ?? [];
  const missing = files.filter((f) => !fs.existsSync(path.join(projectDir, f)));
  if (missing.length) return { status: 'missing', missing };
  const current = hashContents(files.map((f) => fs.readFileSync(path.join(projectDir, f), 'utf8')));
  return { status: current === entry.adaptedHash ? 'adapted' : 'edited', missing: [] };
}

export function readRegistryItems(projectDir) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.frontend-kit.json'), 'utf8'));
    return Array.isArray(state.registryItems) ? state.registryItems : [];
  } catch {
    return [];
  }
}
