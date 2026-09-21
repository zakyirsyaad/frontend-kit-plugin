import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const EXIT_CODES = Object.freeze({
  OK: 0,
  FIXABLE: 1,
  UNSUPPORTED: 2,
});

export function checkGitStatus(targetDir) {
  try {
    const isGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: targetDir,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim() === 'true';

    if (!isGit) {
      return { isGit: false, clean: true, files: [] };
    }

    const statusOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: targetDir,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();

    if (!statusOutput) {
      return { isGit: true, clean: true, files: [] };
    }

    const files = statusOutput
      .split('\n')
      .map((line) => line.trim().slice(3).trim())
      .filter(Boolean);

    return {
      isGit: true,
      clean: false,
      files,
    };
  } catch {
    return { isGit: false, clean: true, files: [] };
  }
}

export function ensureGitIgnoreEntry(projectDir, entry = '.frontend-kit/') {
  const gitIgnorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitIgnorePath)) return;

  try {
    const content = fs.readFileSync(gitIgnorePath, 'utf8');
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    if (!lines.includes(entry) && !lines.includes('.frontend-kit')) {
      const newLine = content.endsWith('\n') ? `${entry}\n` : `\n${entry}\n`;
      fs.appendFileSync(gitIgnorePath, newLine);
    }
  } catch {
    // Ignore error if gitignore is read-only
  }
}

export function createBackup(filePath, projectDir) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(projectDir, '.frontend-kit', 'backup', timestamp);
  const backupFile = path.join(backupDir, backupRelativePath(filePath, projectDir));

  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.copyFileSync(filePath, backupFile);
  ensureGitIgnoreEntry(projectDir, '.frontend-kit/');

  return backupFile;
}

function backupRelativePath(filePath, projectDir) {
  const relPath = path.relative(projectDir, path.resolve(filePath));

  // A file inside the project keeps its layout inside the backup folder.
  if (relPath && !path.isAbsolute(relPath) && relPath.split(path.sep)[0] !== '..') {
    return relPath;
  }

  // Outside the project (or on another Windows drive) path.join would either
  // escape the backup folder or produce 'D:\\proj\\backup\\C:\\file', which Windows
  // rejects. Flatten the path instead so the copy stays inside the folder.
  const resolved = path.resolve(filePath);
  const flattened = resolved
    .replace(/^[A-Za-z]:/, '')
    .replace(/[\\/]+/g, '_')
    .replace(/^_+/, '');
  return path.join('_external', flattened);
}

// Line operations turning `a` into `b`: [{ op: ' ' | '-' | '+', line }].
// LCS on the part between the common prefix and suffix, so an insertion at the
// top of a file shows as an insertion instead of every later line changing.
function diffLines(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops = a.slice(0, start).map((line) => ({ op: ' ', line }));

  if (midA.length * midB.length > 4_000_000) {
    // Too large for the table: fall back to delete-then-insert for the middle.
    ops.push(...midA.map((line) => ({ op: '-', line })), ...midB.map((line) => ({ op: '+', line })));
  } else {
    const n = midA.length;
    const m = midB.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push({ op: ' ', line: midA[i] });
        i++;
        j++;
      } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
        ops.push({ op: '-', line: midA[i] });
        i++;
      } else {
        ops.push({ op: '+', line: midB[j] });
        j++;
      }
    }
  }
  ops.push(...a.slice(endA).map((line) => ({ op: ' ', line })));
  return ops;
}

export function computeUnifiedDiff(filePath, oldContent, newContent, context = 3) {
  if (oldContent === newContent) {
    return '';
  }
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];
  const ops = diffLines(oldLines, newLines);

  // Group changes into hunks with `context` unchanged lines around them.
  const hunks = [];
  let oldNo = 1;
  let newNo = 1;
  let current = null;
  let trailing = 0;
  ops.forEach((entry, index) => {
    const isChange = entry.op !== ' ';
    if (isChange) {
      if (!current) {
        const lead = [];
        for (let k = index - 1; k >= 0 && lead.length < context && ops[k].op === ' '; k--) lead.unshift(ops[k]);
        current = { oldStart: oldNo - lead.length, newStart: newNo - lead.length, lines: [...lead] };
        hunks.push(current);
      }
      current.lines.push(entry);
      trailing = 0;
    } else if (current) {
      // Keep context after a change; close the hunk once the gap is too wide to merge.
      const nextChange = ops.slice(index + 1, index + 1 + 2 * context).some((o) => o.op !== ' ');
      if (trailing < context || nextChange) {
        current.lines.push(entry);
        trailing++;
      } else {
        current = null;
      }
    }
    if (entry.op !== '+') oldNo++;
    if (entry.op !== '-') newNo++;
  });

  const out = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (const h of hunks) {
    while (h.lines.length && h.lines[h.lines.length - 1].op === ' ' && h.lines.filter((l) => l.op === ' ').length > 0) {
      // Trim trailing context beyond the limit (merged hunks may carry extra).
      let tail = 0;
      for (let k = h.lines.length - 1; k >= 0 && h.lines[k].op === ' '; k--) tail++;
      if (tail <= context) break;
      h.lines.pop();
    }
    const oldCount = h.lines.filter((l) => l.op !== '+').length;
    const newCount = h.lines.filter((l) => l.op !== '-').length;
    out.push(`@@ -${oldCount ? h.oldStart : h.oldStart - 1},${oldCount} +${newCount ? h.newStart : h.newStart - 1},${newCount} @@`);
    out.push(...h.lines.map((l) => `${l.op}${l.line}`));
  }
  return out.join('\n');
}

export function safeWriteFile(filePath, newContent, options = {}) {
  const {
    dryRun = false,
    projectDir = process.cwd(),
    backup = true,
  } = options;

  const exists = fs.existsSync(filePath);
  const oldContent = exists ? fs.readFileSync(filePath, 'utf8') : '';

  if (exists && oldContent === newContent) {
    return {
      path: filePath,
      changed: false,
      diff: '',
      backupPath: null,
      dryRun,
    };
  }

  const relPath = path.relative(projectDir, filePath);
  const diff = computeUnifiedDiff(relPath, oldContent, newContent);

  if (dryRun) {
    return {
      path: filePath,
      changed: true,
      diff,
      backupPath: null,
      dryRun: true,
    };
  }

  let backupPath = null;
  if (exists && backup) {
    backupPath = createBackup(filePath, projectDir);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, newContent);

  return {
    path: filePath,
    changed: true,
    diff,
    backupPath,
    dryRun: false,
  };
}
