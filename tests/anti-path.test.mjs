import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function getFilesRecursively(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

test('F2.1: anti-path personal and anti-legacy checks in rules/ and templates/', () => {
  const dirsToCheck = ['rules', 'templates'];
  const forbiddenPatterns = [
    { pattern: /\/Users\//, name: '/Users/ path' },
    { pattern: /~\/\.claude/, name: '~/.claude path' },
    { pattern: /create-systems-frontend/, name: 'create-systems-frontend reference' },
    { pattern: /\bSKILL_DIR\b/, name: 'SKILL_DIR variable' },
  ];

  const violations = [];

  for (const dirName of dirsToCheck) {
    const fullDir = path.join(REPO_ROOT, dirName);
    if (!fs.existsSync(fullDir)) continue;
    const files = getFilesRecursively(fullDir);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(REPO_ROOT, file);

      for (const { pattern, name } of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push(`${relPath} contains ${name}`);
        }
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Found violations in rules/ or templates/:\n${violations.join('\n')}`
  );
});

test('F2.1: anti-path personal in skills/', () => {
  const fullDir = path.join(REPO_ROOT, 'skills');
  if (!fs.existsSync(fullDir)) return;
  const files = getFilesRecursively(fullDir);
  const violations = [];

  const personalPatterns = [
    { pattern: /\/Users\//, name: '/Users/ path' },
    { pattern: /~\/\.claude/, name: '~/.claude path' },
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(REPO_ROOT, file);

    for (const { pattern, name } of personalPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relPath} contains ${name}`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Found personal paths in skills/:\n${violations.join('\n')}`
  );
});
