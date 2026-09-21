import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const EVALS_DIR = path.join(REPO_ROOT, 'evals');

// Each eval asserts a behaviour that some skill, agent or script must still
// define. If the rule moves or disappears, the eval is measuring nothing, so
// the contract is checked here rather than discovered during a paid run.
const CONTRACTS = {
  'rules-activates-tsx-shadcn': ['skills/rules/SKILL.md'],
  'rules-silent-python-repo': ['skills/rules/SKILL.md'],
  'rules-silent-plain-react': ['skills/rules/SKILL.md'],
  'create-not-auto-invoked': ['skills/create/SKILL.md'],
  'theme-contextual-asks-before-write': ['skills/theme/SKILL.md'],
  'theme-silent-on-unrelated-css-talk': ['skills/theme/SKILL.md'],
  'theme-no-hand-edited-tokens': ['skills/theme/SKILL.md', 'scripts/apply-theme-tokens.mjs'],
  'adopt-refuses-dirty-tree': ['skills/adopt/SKILL.md'],
  'adopt-stops-on-tailwind-v3': ['skills/adopt/SKILL.md', 'scripts/detect-project.mjs'],
  'reviewer-read-only': ['agents/frontend-reviewer.md', 'scripts/review-scan.mjs'],
  'reviewer-flags-slop': ['agents/frontend-reviewer.md', 'scripts/review-scan.mjs'],
  'blocks-not-auto-invoked': ['skills/blocks/SKILL.md'],
  'effects-asks-before-install': ['skills/effects/SKILL.md', 'scripts/inspect-registry-item.mjs', 'catalog/effects.json'],
  'effects-declines-dashboard-decoration': ['skills/effects/SKILL.md', 'rules/core.md', 'scripts/review-scan.mjs'],
};

function evalCases() {
  if (!fs.existsSync(EVALS_DIR)) return [];
  return fs
    .readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'results' && e.name !== 'mocks')
    .map((e) => e.name);
}

test('A4.2: every eval case has a prompt and at least one grader', () => {
  const cases = evalCases();
  assert.ok(cases.length >= 10, `expected the ten planned cases, found ${cases.length}`);

  for (const name of cases) {
    const dir = path.join(EVALS_DIR, name);
    const hasCaseYaml = fs.existsSync(path.join(dir, 'case.yaml'));
    const hasPrompt = fs.existsSync(path.join(dir, 'prompt.md'));
    assert.ok(hasCaseYaml || hasPrompt, `${name} needs case.yaml or prompt.md`);

    if (hasPrompt) {
      const graderDir = path.join(dir, 'graders');
      assert.ok(fs.existsSync(graderDir), `${name} needs graders/`);
      const graders = fs.readdirSync(graderDir).filter((f) => f.endsWith('.md'));
      assert.ok(graders.length > 0, `${name} needs at least one grader`);
      for (const grader of graders) {
        const text = fs.readFileSync(path.join(graderDir, grader), 'utf8');
        assert.match(text, /Lulus bila|Pass when/i, `${name}/${grader} must state pass criteria`);
        assert.match(text, /Gagal bila|Fail when/i, `${name}/${grader} must state fail criteria`);
      }
    }
  }
});

test('A4.2: each eval case maps to a rule that still exists in the plugin', () => {
  for (const [name, sources] of Object.entries(CONTRACTS)) {
    assert.ok(fs.existsSync(path.join(EVALS_DIR, name)), `contract names a missing case: ${name}`);
    for (const source of sources) {
      assert.ok(
        fs.existsSync(path.join(REPO_ROOT, source)),
        `${name} depends on ${source}, which no longer exists`
      );
    }
  }
  for (const name of evalCases()) {
    assert.ok(CONTRACTS[name], `eval case ${name} has no contract entry; add one`);
  }
});

test('A4.2: a prompt never contains the answer it grades', () => {
  // A fixture that spells out the rule turns the eval into a reading test.
  const leaks = [/frontend-kit:/, /bg-status-live/, /useGSAP/, /--force\b/];
  for (const name of evalCases()) {
    const promptPath = path.join(EVALS_DIR, name, 'prompt.md');
    if (!fs.existsSync(promptPath)) continue;
    const prompt = fs.readFileSync(promptPath, 'utf8');
    for (const leak of leaks) {
      assert.ok(!leak.test(prompt), `${name}/prompt.md leaks the expected answer (${leak})`);
    }
  }
});
