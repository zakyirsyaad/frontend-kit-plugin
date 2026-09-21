import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_CONFIG = Object.freeze({
  default_palette: 'zinc',
  default_accent: 'none',
  default_radius: 'default',
  default_display_font: 'none',
  package_manager: 'bun',
  animation: 'motion',
});

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

export function parseLocalMarkdownConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      return {};
    }

    const frontmatter = match[1];
    const lines = frontmatter.split(/\r?\n/);
    const parsed = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const rawKey = trimmed.slice(0, colonIndex).trim();
      let rawVal = trimmed.slice(colonIndex + 1).trim();

      // Strip optional quotes
      if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
        rawVal = rawVal.slice(1, -1).trim();
      }

      // Normalize key (snake_case)
      const normalizedKey = rawKey.replace(/-/g, '_').toLowerCase();
      parsed[normalizedKey] = rawVal;
    }

    return parsed;
  } catch {
    return {};
  }
}

export function readEnvOptions(env = process.env) {
  const options = {};

  for (const key of CONFIG_KEYS) {
    const envVarName = `CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`;
    if (env[envVarName] !== undefined && env[envVarName] !== '') {
      options[key] = env[envVarName];
    }
  }

  return options;
}

export function resolveConfig(rootDir = process.cwd(), cliOverrides = {}, env = process.env) {
  const localConfigPath = path.join(rootDir, '.claude', 'frontend-kit.local.md');
  const localOptions = parseLocalMarkdownConfig(localConfigPath);
  const envOptions = readEnvOptions(env);

  const resolved = {};

  for (const key of CONFIG_KEYS) {
    // Normalisasi cliOverrides keys (bisa kebab-case atau snake_case atau alias tanpa default_)
    const altKeyKebab = key.replace(/_/g, '-');
    const shortKey = key.startsWith('default_') ? key.replace('default_', '') : key;
    const shortKeyKebab = shortKey.replace(/_/g, '-');

    const cliVal =
      cliOverrides[key] ??
      cliOverrides[altKeyKebab] ??
      cliOverrides[shortKey] ??
      cliOverrides[shortKeyKebab];

    const localVal =
      localOptions[key] ??
      localOptions[altKeyKebab] ??
      localOptions[shortKey] ??
      localOptions[shortKeyKebab];

    const envVal = envOptions[key];

    if (cliVal !== undefined && cliVal !== null && cliVal !== '') {
      resolved[key] = String(cliVal);
    } else if (localVal !== undefined && localVal !== null && localVal !== '') {
      resolved[key] = String(localVal);
    } else if (envVal !== undefined && envVal !== null && envVal !== '') {
      resolved[key] = String(envVal);
    } else {
      resolved[key] = DEFAULT_CONFIG[key];
    }
  }

  return resolved;
}
