import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content };
  const rawYaml = match[1];
  const body = content.slice(match[0].length);

  const frontmatter = {};
  const lines = rawYaml.split(/\r?\n/);
  let currentKey = null;
  let isList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const keyValMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyValMatch) {
      currentKey = keyValMatch[1];
      const val = keyValMatch[2].trim();
      if (val === '') {
        isList = true;
        frontmatter[currentKey] = [];
      } else {
        isList = false;
        // Strip quotes
        frontmatter[currentKey] = val.replace(/^['"](.*)['"]$/, '$1');
      }
    } else if (isList && trimmed.startsWith('-')) {
      const item = trimmed.replace(/^-\s*/, '').replace(/^['"](.*)['"]$/, '$1');
      frontmatter[currentKey].push(item);
    }
  }

  return { frontmatter, body };
}

test('F8.1: manifest and versions are synchronized', () => {
  const pluginJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const rootMarketplace = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'marketplace.json'), 'utf8'));
  const pluginMarketplace = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));

  assert.equal(pluginJson.name, 'frontend-kit');
  // All three must agree; the value itself moves with every release.
  assert.match(pluginJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(rootMarketplace.plugins[0].version, pluginJson.version);
  assert.equal(pluginMarketplace.plugins[0].version, pluginJson.version);
});

test('F8.1: skill name matches folder name and description <= 400 chars', () => {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

  assert.ok(skillFolders.length >= 4, 'Should have at least create, theme, rules, doctor');

  for (const folder of skillFolders) {
    const skillPath = path.join(skillsDir, folder.name, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `SKILL.md must exist in skills/${folder.name}`);

    const content = fs.readFileSync(skillPath, 'utf8');
    const { frontmatter } = parseFrontmatter(content);

    assert.equal(
      frontmatter.name,
      folder.name,
      `skills/${folder.name}/SKILL.md name '${frontmatter.name}' must match directory name '${folder.name}'`
    );

    assert.ok(frontmatter.description, `skills/${folder.name}/SKILL.md must have a description`);
    assert.ok(
      frontmatter.description.length <= 400,
      `skills/${folder.name}/SKILL.md description length (${frontmatter.description.length}) must be <= 400 characters`
    );
  }
});

test('F8.1: each SKILL.md body <= 2000 words', () => {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const folder of skillFolders) {
    const skillPath = path.join(skillsDir, folder.name, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    const { body } = parseFrontmatter(content);

    const words = body.trim().split(/\s+/).filter(Boolean);
    assert.ok(
      words.length <= 2000,
      `skills/${folder.name}/SKILL.md body word count (${words.length}) must be <= 2000 words`
    );
  }
});

test('F8.1: script paths referenced in SKILL.md exist on disk', () => {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

  const scriptPattern = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/|scripts\/)(scripts\/[a-zA-Z0-9_\-\/.]+\.mjs|[a-zA-Z0-9_\-\/.]+\.mjs)/g;

  for (const folder of skillFolders) {
    const skillPath = path.join(skillsDir, folder.name, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');

    const matches = [...content.matchAll(scriptPattern)];
    for (const match of matches) {
      const scriptRel = match[1].startsWith('scripts/') ? match[1] : path.join('scripts', match[1]);
      const fullScriptPath = path.join(REPO_ROOT, scriptRel);

      assert.ok(
        fs.existsSync(fullScriptPath),
        `Script referenced in skills/${folder.name}/SKILL.md does not exist: ${scriptRel}`
      );
    }
  }
});

test('F8.1: agents are read-only (no Write/Edit in tools)', () => {
  const agentsDir = path.join(REPO_ROOT, 'agents');
  if (!fs.existsSync(agentsDir)) return;

  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  assert.ok(agentFiles.length > 0, 'at least one agent ships with the plugin');

  for (const file of agentFiles) {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const { frontmatter } = parseFrontmatter(content);

    // Installed agents declare their tools as `tools: Read, Glob, …`
    // (see claude-security and explore in the official marketplace), so that is
    // the field that actually governs access.
    const raw = frontmatter['tools'];
    const tools = Array.isArray(raw) ? raw : String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    assert.ok(tools.length > 0, `Agent ${file} must declare its tools`);
    for (const forbidden of ['Write', 'Edit', 'NotebookEdit']) {
      assert.ok(
        !tools.some((tool) => tool === forbidden || tool.startsWith(`${forbidden}(`)),
        `Agent ${file} must not list ${forbidden} in tools`
      );
    }

    const disallowedRaw = frontmatter['disallowedTools'] ?? frontmatter['disallowed-tools'];
    const disallowed = Array.isArray(disallowedRaw)
      ? disallowedRaw
      : String(disallowedRaw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    assert.ok(
      disallowed.includes('Write') && disallowed.includes('Edit'),
      `Agent ${file} must also deny Write and Edit explicitly`
    );
  }
});

test('F8.1: README references every skill and every script', () => {
  const readmePath = path.join(REPO_ROOT, 'README.md');
  assert.ok(fs.existsSync(readmePath));
  const readmeContent = fs.readFileSync(readmePath, 'utf8');

  // Derived from the tree, so a new skill or script cannot ship undocumented.
  const skills = fs
    .readdirSync(path.join(REPO_ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const skill of skills) {
    assert.ok(readmeContent.includes(`/frontend-kit:${skill}`), `README.md must mention /frontend-kit:${skill}`);
  }

  const scripts = fs.readdirSync(path.join(REPO_ROOT, 'scripts')).filter((f) => f.endsWith('.mjs'));
  for (const script of scripts) {
    assert.ok(readmeContent.includes(script), `README.md must reference script ${script}`);
  }
});

test('F8.1: scripts read the plugin version from the manifest, never hardcode it', () => {
  // A hardcoded version silently rots: markers keep the old number after a bump
  // and every project then reads as outdated.
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const scriptsDir = path.join(REPO_ROOT, 'scripts');
  const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.mjs'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
    const hardcoded = content.match(/PLUGIN_VERSION\s*=\s*['"]([\d.]+)['"]/);
    assert.equal(
      hardcoded,
      null,
      `scripts/${file} hardcodes PLUGIN_VERSION = ${hardcoded?.[1]}; read it from .claude-plugin/plugin.json`
    );
    const literal = content.match(/\b(?:pluginVersion|kitVersion)\s*:\s*['"](\d+\.\d+\.\d+)['"]/);
    assert.ok(!literal, `scripts/${file} reports a literal version ${literal?.[1]}; use the manifest version`);
    const marker = content.match(/frontend-kit:core v([\d.]+)/);
    if (marker) {
      assert.equal(marker[1], manifest.version, `scripts/${file} writes a stale marker version`);
    }
  }
});

test('F8.1: no file resolves its own path through a file URL pathname', () => {
  // Built from parts so this file does not match its own check.
  const FORBIDDEN_PATH_PATTERN = ['new URL(import.meta', '.url).pathname'].join('');
  // On Windows that yields "/C:/..." and path.join then produces "D:\\D:\\...".
  // import.meta.dirname / import.meta.filename are correct on every platform.
  const roots = ['scripts', 'tests'];
  for (const root of roots) {
    const dir = path.join(REPO_ROOT, root);
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.name.endsWith('.mjs')) {
          const content = fs.readFileSync(full, 'utf8');
          assert.ok(
            !content.includes(FORBIDDEN_PATH_PATTERN),
            `${path.relative(REPO_ROOT, full)} uses a Windows-unsafe path; use import.meta.dirname`
          );
        }
      }
    }
  }
});
