import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { safeWriteFile, checkGitStatus, computeUnifiedDiff, EXIT_CODES } from '../scripts/lib/fs-safe.mjs';

test('F2.4: EXIT_CODES conforms to 0 (ok), 1 (fixable), 2 (unsupported)', () => {
  assert.equal(EXIT_CODES.OK, 0);
  assert.equal(EXIT_CODES.FIXABLE, 1);
  assert.equal(EXIT_CODES.UNSUPPORTED, 2);
});

test('F2.4: safeWriteFile in dryRun mode does not change file content or mtime', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-fssafe-test-'));

  try {
    const targetFile = path.join(tempDir, 'test.css');
    const initialContent = ':root { --color: red; }\n';
    fs.writeFileSync(targetFile, initialContent);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const statBefore = fs.statSync(targetFile);

    const newContent = ':root { --color: blue; }\n';
    const res = safeWriteFile(targetFile, newContent, {
      dryRun: true,
      projectDir: tempDir,
    });

    assert.equal(res.changed, true);
    assert.equal(res.dryRun, true);
    assert.ok(res.diff.includes('-:root { --color: red; }'));
    assert.ok(res.diff.includes('+:root { --color: blue; }'));

    const statAfter = fs.statSync(targetFile);
    assert.equal(statAfter.mtimeMs, statBefore.mtimeMs, 'mtime must not change on dry-run');
    assert.equal(fs.readFileSync(targetFile, 'utf8'), initialContent, 'content must not change on dry-run');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.4: safeWriteFile creates backup when overwriting existing file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-fssafe-test-'));

  try {
    const targetFile = path.join(tempDir, 'src', 'app', 'globals.css');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    const originalContent = ':root { --primary: red; }\n';
    fs.writeFileSync(targetFile, originalContent);

    const newContent = ':root { --primary: blue; }\n';
    const res = safeWriteFile(targetFile, newContent, {
      dryRun: false,
      projectDir: tempDir,
      backup: true,
    });

    assert.equal(res.changed, true);
    assert.equal(res.dryRun, false);
    assert.ok(res.backupPath, 'backupPath should be returned');
    assert.ok(fs.existsSync(res.backupPath), 'backup file must exist on disk');
    assert.equal(fs.readFileSync(res.backupPath, 'utf8'), originalContent);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), newContent);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.4: safeWriteFile reports changed: false when content is identical', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-fssafe-test-'));

  try {
    const targetFile = path.join(tempDir, 'test.txt');
    const content = 'hello world\n';
    fs.writeFileSync(targetFile, content);

    const res = safeWriteFile(targetFile, content, {
      dryRun: false,
      projectDir: tempDir,
    });

    assert.equal(res.changed, false);
    assert.equal(res.diff, '');
    assert.equal(res.backupPath, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.4: checkGitStatus detects clean repo and non-git dirs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-fssafe-test-'));
  try {
    const status = checkGitStatus(tempDir);
    assert.equal(status.isGit, false);
    assert.equal(status.clean, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('F2.4: backups of files outside the project stay inside the backup folder', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-fs-proj-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-fs-outside-'));
  try {
    const target = path.join(outsideDir, 'globals.css');
    fs.writeFileSync(target, 'old\n');

    // On Windows path.join(backupDir, 'C:\\Users\\...') is not a valid path, and
    // on POSIX a '../..' relative path would escape the backup folder.
    const result = safeWriteFile(target, 'new\n', { projectDir });

    assert.ok(result.backupPath, 'a backup is still created');
    const backupRoot = path.join(projectDir, '.frontend-kit', 'backup');
    assert.ok(
      path.resolve(result.backupPath).startsWith(path.resolve(backupRoot) + path.sep),
      `backup ${result.backupPath} must stay under ${backupRoot}`
    );
    assert.ok(!result.backupPath.includes('..'), 'backup path never walks up');
    assert.strictEqual(fs.readFileSync(result.backupPath, 'utf8'), 'old\n');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'new\n');
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('B2.4: diff shows an insertion as an insertion, in hunks with context', () => {
  const a = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const b = a.replace('line 1\n', 'line 1\ninserted\n').replace('line 30', 'line 30 changed');
  const diff = computeUnifiedDiff('f.txt', a, b);
  const body = diff.split('\n').filter((l) => /^[+-](?![+-]{2} )/.test(l));
  assert.deepEqual(body, ['+inserted', '-line 30', '+line 30 changed']);
  assert.match(diff, /^@@ -1,5 \+1,6 @@$/m);
  assert.match(diff, /^@@ -28,7 \+29,7 @@$/m);
  assert.ok(!diff.includes(' line 15'), 'unchanged lines far from a change are not printed');
});
