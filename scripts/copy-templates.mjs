#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { detectProject } from './detect-project.mjs';
import { safeWriteFile, EXIT_CODES } from './lib/fs-safe.mjs';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const TEMPLATES_DIR = path.join(PLUGIN_ROOT, 'templates');
export const BLOCK_MANIFEST = 'block.json';
export const BLOCK_APP_PREFIX = 'app/';

export function resolveComponentsDir(resolvedDir, report) {
  const srcDir = report.router?.srcDir ?? fs.existsSync(path.join(resolvedDir, 'src'));
  const compAlias = report.shadcn?.aliases?.components;

  if (compAlias) {
    const stripped = compAlias.replace(/^@\//, '').replace(/^~\//, '');
    const candidates = [
      srcDir && !stripped.startsWith('src/') ? path.join('src', stripped) : stripped,
      stripped,
    ];
    for (const cand of candidates) {
      if (fs.existsSync(path.join(resolvedDir, cand))) {
        return cand.replace(/\\/g, '/');
      }
    }
    return (srcDir && !stripped.startsWith('src/') ? path.join('src', stripped) : stripped).replace(/\\/g, '/');
  }

  if (report.shadcn?.uiDir) {
    return path.dirname(report.shadcn.uiDir).replace(/\\/g, '/');
  }

  if (fs.existsSync(path.join(resolvedDir, 'src', 'components'))) {
    return 'src/components';
  }
  if (fs.existsSync(path.join(resolvedDir, 'components'))) {
    return 'components';
  }

  return srcDir ? 'src/components' : 'components';
}

export function resolveDestinationDir(group, resolvedDir, report, customTarget = null) {
  if (customTarget) {
    return customTarget.replace(/\\/g, '/');
  }

  const componentsDir = resolveComponentsDir(resolvedDir, report);
  const appDir = report.router?.appDir || (report.router?.srcDir ? 'src/app' : 'app');

  if (group === '3d') {
    return `${componentsDir}/systems`;
  }
  if (group === 'boundaries') {
    return appDir;
  }
  if (group.startsWith('blocks/')) {
    return `${componentsDir}/${group}`;
  }

  return `${componentsDir}/${group}`;
}

export function applyAliasReplacements(content, aliases = {}) {
  let result = content;

  const replacements = [];

  if (aliases.ui && aliases.ui !== '@/components/ui') {
    replacements.push({ from: '@/components/ui', to: aliases.ui });
  }
  if (aliases.utils && aliases.utils !== '@/lib/utils') {
    replacements.push({ from: '@/lib/utils', to: aliases.utils });
  }
  if (aliases.components && aliases.components !== '@/components') {
    replacements.push({ from: '@/components', to: aliases.components });
  }
  if (aliases.lib && aliases.lib !== '@/lib') {
    replacements.push({ from: '@/lib', to: aliases.lib });
  }
  if (aliases.hooks && aliases.hooks !== '@/hooks') {
    replacements.push({ from: '@/hooks', to: aliases.hooks });
  }

  replacements.sort((a, b) => b.from.length - a.from.length);

  for (const { from, to } of replacements) {
    result = result.replaceAll(from, to);
  }

  return result;
}

function getFilesRecursively(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push({
        fullPath,
        relPath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
      });
    }
  }
  return results;
}

export function copyTemplates(group, targetDir, options = {}) {
  const resolvedDir = path.resolve(targetDir || '.');

  if (!fs.existsSync(resolvedDir)) {
    const err = new Error(`Target directory "${resolvedDir}" does not exist.`);
    err.code = EXIT_CODES.UNSUPPORTED;
    throw err;
  }

  const groupTemplateDir = path.join(TEMPLATES_DIR, group);
  if (!fs.existsSync(groupTemplateDir)) {
    const err = new Error(`Template group "${group}" not found in templates directory.`);
    err.code = EXIT_CODES.FIXABLE;
    throw err;
  }

  // block.json describes a block (shadcn components, npm deps) for the blocks skill; it is not copied.
  const templateFiles = getFilesRecursively(groupTemplateDir).filter((f) => f.relPath !== BLOCK_MANIFEST);
  if (templateFiles.length === 0) {
    const err = new Error(`Template group "${group}" contains no template files.`);
    err.code = EXIT_CODES.FIXABLE;
    throw err;
  }

  const report = detectProject(resolvedDir, { for: 'create' });
  const aliases = report.shadcn?.aliases || {};
  const destinationRelDir = resolveDestinationDir(group, resolvedDir, report, options.target);
  const destinationFullDir = path.join(resolvedDir, destinationRelDir);
  // A block's app/ folder holds route files (layout, loading, page); they go to the project's app dir.
  const appDir = report.router?.appDir || (report.router?.srcDir ? 'src/app' : 'app');
  const targetFor = (relPath) =>
    group.startsWith('blocks/') && relPath.startsWith(BLOCK_APP_PREFIX) && !options.target
      ? path.join(resolvedDir, appDir, relPath.slice(BLOCK_APP_PREFIX.length))
      : path.join(destinationFullDir, relPath);

  const fileResults = [];
  const warnings = [];
  let copiedCount = 0;
  let skippedCount = 0;

  for (const { fullPath, relPath } of templateFiles) {
    const rawContent = fs.readFileSync(fullPath, 'utf8');
    const transformedContent = applyAliasReplacements(rawContent, aliases);

    const targetFilePath = targetFor(relPath);
    const targetRelPath = path.relative(resolvedDir, targetFilePath).replace(/\\/g, '/');
    const fileExists = fs.existsSync(targetFilePath);

    if (fileExists) {
      const existingContent = fs.readFileSync(targetFilePath, 'utf8');
      if (existingContent === transformedContent) {
        fileResults.push({
          source: path.relative(PLUGIN_ROOT, fullPath).replace(/\\/g, '/'),
          target: targetRelPath,
          status: 'unchanged',
          changed: false,
          diff: '',
          backupPath: null,
        });
        continue;
      }

      if (!options.force) {
        skippedCount++;
        warnings.push(`File "${targetRelPath}" already exists with different content. Skipped without --force.`);
        fileResults.push({
          source: path.relative(PLUGIN_ROOT, fullPath).replace(/\\/g, '/'),
          target: targetRelPath,
          status: 'skipped',
          changed: false,
          diff: '',
          backupPath: null,
        });
        continue;
      }
    }

    const writeRes = safeWriteFile(targetFilePath, transformedContent, {
      dryRun: Boolean(options.dryRun),
      projectDir: resolvedDir,
      backup: true,
    });

    copiedCount++;
    fileResults.push({
      source: path.relative(PLUGIN_ROOT, fullPath).replace(/\\/g, '/'),
      target: targetRelPath,
      status: fileExists ? 'overwritten' : 'created',
      changed: writeRes.changed,
      diff: writeRes.diff,
      backupPath: writeRes.backupPath,
    });
  }

  return {
    success: true,
    group,
    targetDir: resolvedDir,
    destinationDir: destinationRelDir,
    files: fileResults,
    copiedCount,
    skippedCount,
    warnings,
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let group = null;
  let targetDir = '.';
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--target' && args[i + 1]) {
      options.target = args[++i];
    } else if (!arg.startsWith('--')) {
      if (!group) {
        group = arg;
      } else {
        targetDir = arg;
      }
    }
  }

  if (!group) {
    console.error('Usage: node copy-templates.mjs <group> [targetDir] [--target <subpath>] [--force] [--dry-run] [--json]');
    process.exit(EXIT_CODES.FIXABLE);
  }

  try {
    const res = copyTemplates(group, targetDir, options);

    if (options.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      const modeNote = options.dryRun ? ' [dry-run]' : '';
      console.log(`Template group "${group}" -> ${res.destinationDir}${modeNote}:`);
      for (const f of res.files) {
        if (f.status === 'created') {
          console.log(`  + ${f.target} (created)`);
        } else if (f.status === 'overwritten') {
          console.log(`  ! ${f.target} (overwritten)`);
        } else if (f.status === 'skipped') {
          console.log(`  = ${f.target} (skipped - exists, use --force)`);
        } else if (f.status === 'unchanged') {
          console.log(`  . ${f.target} (unchanged)`);
        }
      }
      for (const w of res.warnings) {
        console.warn(`Warning: ${w}`);
      }
    }
    process.exit(EXIT_CODES.OK);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(err.code || EXIT_CODES.FIXABLE);
  }
}
