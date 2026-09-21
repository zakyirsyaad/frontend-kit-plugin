import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveConfig, parseLocalMarkdownConfig, readEnvOptions, DEFAULT_CONFIG } from '../scripts/lib/config.mjs';

test('F2.3: default config is returned when no overrides exist', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-config-test-'));
  try {
    const config = resolveConfig(tempDir, {}, {});
    assert.deepEqual(config, DEFAULT_CONFIG);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.3: env options override defaults', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-config-test-'));
  try {
    const mockEnv = {
      CLAUDE_PLUGIN_OPTION_DEFAULT_PALETTE: 'stone',
      CLAUDE_PLUGIN_OPTION_PACKAGE_MANAGER: 'pnpm',
    };
    const config = resolveConfig(tempDir, {}, mockEnv);
    assert.equal(config.default_palette, 'stone');
    assert.equal(config.package_manager, 'pnpm');
    assert.equal(config.animation, 'motion'); // keeps default
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.3: local markdown config overrides env options and defaults', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-config-test-'));
  try {
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.claude', 'frontend-kit.local.md'),
      `---
default_palette: slate
package_manager: npm
default-accent: emerald
---
# Local user overrides
`
    );

    const mockEnv = {
      CLAUDE_PLUGIN_OPTION_DEFAULT_PALETTE: 'stone',
      CLAUDE_PLUGIN_OPTION_PACKAGE_MANAGER: 'pnpm',
    };

    const config = resolveConfig(tempDir, {}, mockEnv);
    assert.equal(config.default_palette, 'slate'); // from local file
    assert.equal(config.package_manager, 'npm'); // from local file
    assert.equal(config.default_accent, 'emerald'); // from local file (kebab-case parsed)
    assert.equal(config.animation, 'motion'); // default
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.3: CLI overrides have highest precedence', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-config-test-'));
  try {
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.claude', 'frontend-kit.local.md'),
      `---
default_palette: slate
package_manager: npm
---
`
    );

    const mockEnv = {
      CLAUDE_PLUGIN_OPTION_DEFAULT_PALETTE: 'stone',
      CLAUDE_PLUGIN_OPTION_PACKAGE_MANAGER: 'pnpm',
    };

    const cliOverrides = {
      palette: 'mauve',
      'package-manager': 'yarn',
    };

    const config = resolveConfig(tempDir, cliOverrides, mockEnv);
    assert.equal(config.default_palette, 'mauve'); // CLI wins
    assert.equal(config.package_manager, 'yarn'); // CLI wins
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
