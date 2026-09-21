#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { detectProject } from './detect-project.mjs';
import { safeWriteFile } from './lib/fs-safe.mjs';

// Read from the manifest so a version bump cannot leave stale markers behind.
const PLUGIN_VERSION = (() => {
  try {
    const manifestPath = path.join(path.resolve(import.meta.dirname, '..'), '.claude-plugin', 'plugin.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

// Known SHA256 hashes of verbatim rules from d621e65
const D621E65_HASHES = new Set([
  'c6ce488b72e06c1cc22a7063146369524ab74e9dcb5114cf52e4cba8f74367f6', // core only
  'a26cfdf75f71e5130217267586126a8125203d826fa5054e71685e81f6dcdab7', // core + gsap
  'd83341bb97cc21ec6a80e98b14f51d98029fdd5ad0b7a06f96e498befd143732', // core + 3d
  '4c928ef6f6fb0be96e06bccae89cde7bf1281b9915e2a7b1fcc2ad4fcee1fa7e', // core + gsap + 3d
]);

export function composeRules(targetDir, options = {}) {
  const resolvedDir = path.resolve(targetDir || '.');
  const report = detectProject(resolvedDir, { for: 'rules' });

  // 1. Resolve Package Manager info command
  const pmName = report.packageManager?.name || 'bun';
  const pmCommands = report.packageManager?.commands || {};
  const shadcnCmd = pmCommands.shadcn || 'bunx --bun shadcn@4';

  let infoCmd = 'bun info';
  if (pmName === 'pnpm') infoCmd = 'pnpm info';
  else if (pmName === 'yarn') infoCmd = 'yarn info';
  else if (pmName === 'npm') infoCmd = 'npm info';

  // 2. Resolve Aliases
  const uiAlias = report.shadcn?.aliases?.ui || '@/components/ui';
  const utilsAlias = report.shadcn?.aliases?.utils || '@/lib/utils';
  const componentsAlias = report.shadcn?.aliases?.components || '@/components';

  // 3. Resolve Palette
  const palette = report.shadcn?.baseColor || report.css?.palette?.name || 'zinc';

  // 4. Resolve Font Rule
  const hasGeist = report.layout?.geistPackage || Boolean(report.deps?.geist);
  const layoutPath = report.layout?.path || 'src/app/layout.tsx';
  let fontRule = '';
  if (hasGeist) {
    fontRule = `Geist is self-hosted through the \`geist\` package (\`geist/font/sans\`, \`geist/font/mono\`) in \`${layoutPath}\`, wired to \`font-sans\`/\`font-mono\`. Do not switch to \`next/font/google\` or add a \`<link>\` to Google Fonts — builds must not depend on the network for fonts.`;
  } else {
    fontRule = `Keep the project's fonts self-hosted or configured via next/font in \`${layoutPath}\`. Do not add external network font stylesheets.`;
  }

  const placeholders = {
    '{{shadcn}}': shadcnCmd,
    '{{info}}': infoCmd,
    '{{uiAlias}}': uiAlias,
    '{{utilsAlias}}': utilsAlias,
    '{{componentsAlias}}': componentsAlias,
    '{{palette}}': palette,
    '{{fontRule}}': fontRule,
  };

  function applyPlaceholders(content) {
    let res = content;
    for (const [k, v] of Object.entries(placeholders)) {
      res = res.replaceAll(k, v);
    }
    return res;
  }

  // Read template files from plugin rules/ directory
  const pluginRoot = path.resolve(import.meta.dirname, '..');
  const coreTemplatePath = path.join(pluginRoot, 'rules', 'core.md');
  const gsapTemplatePath = path.join(pluginRoot, 'rules', 'gsap.md');
  const threeDTemplatePath = path.join(pluginRoot, 'rules', '3d.md');

  const rawCore = fs.existsSync(coreTemplatePath) ? fs.readFileSync(coreTemplatePath, 'utf8') : '';
  const coreBody = applyPlaceholders(rawCore).trim();

  // Determine GSAP inclusion
  let includeGsap = false;
  if (options.gsap === 'on') {
    includeGsap = true;
  } else if (options.gsap === 'off') {
    includeGsap = false;
  } else {
    // auto
    includeGsap = Boolean(report.deps?.gsap || report.deps?.['@gsap/react']);
  }

  // Determine 3D inclusion
  let include3D = false;
  if (options.threeD === 'on' || options['3d'] === 'on') {
    include3D = true;
  } else if (options.threeD === 'off' || options['3d'] === 'off') {
    include3D = false;
  } else {
    // auto
    include3D = Boolean(report.deps?.['@react-three/fiber'] || report.deps?.three);
  }

  let gsapBody = '';
  if (includeGsap && fs.existsSync(gsapTemplatePath)) {
    gsapBody = applyPlaceholders(fs.readFileSync(gsapTemplatePath, 'utf8')).trim();
  }

  let threeDBody = '';
  if (include3D && fs.existsSync(threeDTemplatePath)) {
    threeDBody = applyPlaceholders(fs.readFileSync(threeDTemplatePath, 'utf8')).trim();
  }

  const sections = [
    {
      name: 'core',
      version: PLUGIN_VERSION,
      body: coreBody,
      markerStart: `<!-- frontend-kit:core v${PLUGIN_VERSION} -->`,
      markerEnd: `<!-- /frontend-kit:core -->`,
    },
  ];

  if (includeGsap && gsapBody) {
    sections.push({
      name: 'gsap',
      version: PLUGIN_VERSION,
      body: gsapBody,
      markerStart: `<!-- frontend-kit:gsap v${PLUGIN_VERSION} -->`,
      markerEnd: `<!-- /frontend-kit:gsap -->`,
    });
  }

  if (include3D && threeDBody) {
    sections.push({
      name: '3d',
      version: PLUGIN_VERSION,
      body: threeDBody,
      markerStart: `<!-- frontend-kit:3d v${PLUGIN_VERSION} -->`,
      markerEnd: `<!-- /frontend-kit:3d -->`,
    });
  }

  return {
    report,
    placeholders,
    sections,
    rawPrintText: [coreBody, gsapBody, threeDBody].filter(Boolean).join('\n\n'),
  };
}

export function writeRules(targetDir, options = {}) {
  const resolvedDir = path.resolve(targetDir || '.');
  const composition = composeRules(resolvedDir, options);
  const { report, placeholders, sections, rawPrintText } = composition;

  // Check gate
  if (options.gate) {
    let gateFailReason = null;
    if (report.stops && report.stops.length > 0) {
      gateFailReason = report.stops[0].message;
    } else if (!report.shadcn?.componentsJson) {
      gateFailReason = 'components.json not found';
    } else if (
      report.css?.shape === 'tailwind-v3' ||
      (report.tailwind?.major && report.tailwind.major < 4) ||
      (report.tailwind?.v4Signals && report.tailwind.v4Signals.length === 0)
    ) {
      gateFailReason = 'Tailwind CSS v4 not detected';
    }

    if (gateFailReason) {
      return {
        success: true,
        gatePassed: false,
        gateReason: gateFailReason,
        message: `frontend-kit rules: not applicable (${gateFailReason}) — ignore this skill.`,
        targetPath: null,
        targetCreated: false,
        claudeMdCreated: false,
        changed: false,
        sections: [],
        placeholders,
        legacyMigrated: false,
        warnings: [],
      };
    }
  }

  // If --print was requested
  if (options.print) {
    return {
      success: true,
      gatePassed: true,
      printText: rawPrintText,
      targetPath: null,
      targetCreated: false,
      claudeMdCreated: false,
      changed: false,
      sections: sections.map((s) => s.name),
      placeholders,
      legacyMigrated: false,
      warnings: [],
    };
  }

  // Determine Target File
  const agentsPath = path.join(resolvedDir, 'AGENTS.md');
  const claudePath = path.join(resolvedDir, 'CLAUDE.md');

  const hasAgents = fs.existsSync(agentsPath);
  const hasClaude = fs.existsSync(claudePath);
  let claudeImportsAgents = false;
  if (hasClaude) {
    const claudeContent = fs.readFileSync(claudePath, 'utf8');
    if (claudeContent.includes('@AGENTS.md')) {
      claudeImportsAgents = true;
    }
  }

  let chosenTarget = 'AGENTS.md';
  let needClaudeImportFile = false;

  if (options.target === 'CLAUDE.md') {
    chosenTarget = 'CLAUDE.md';
  } else if (options.target === 'AGENTS.md') {
    chosenTarget = 'AGENTS.md';
  } else {
    // auto
    if (hasAgents && (!hasClaude || claudeImportsAgents)) {
      chosenTarget = 'AGENTS.md';
    } else if (hasClaude && !hasAgents) {
      chosenTarget = 'CLAUDE.md';
    } else if (hasAgents && hasClaude) {
      chosenTarget = claudeImportsAgents ? 'AGENTS.md' : 'CLAUDE.md';
    } else {
      // Neither exists: create AGENTS.md and CLAUDE.md with @AGENTS.md
      chosenTarget = 'AGENTS.md';
      needClaudeImportFile = true;
    }
  }

  const targetFullPath = path.join(resolvedDir, chosenTarget);
  const targetExisted = fs.existsSync(targetFullPath);
  let existingContent = targetExisted ? fs.readFileSync(targetFullPath, 'utf8') : '';

  const warnings = [];
  let legacyMigrated = false;

  // Build the marked block for all active sections
  const fullMarkedBlock = sections
    .map((s) => `${s.markerStart}\n${s.body}\n${s.markerEnd}`)
    .join('\n\n');

  let updatedContent = existingContent;

  // Check if legacy unversioned block exists
  const legacyHeadingRegex = /# Frontend (?:Systems Engineering Rules|Rules)[\s\S]*?(?=(?:\n# [^\n]+)|$)/;
  const legacyMatch = existingContent.match(legacyHeadingRegex);

  if (legacyMatch && !existingContent.includes('<!-- frontend-kit:core')) {
    const legacyBlock = legacyMatch[0].trim();
    // Normalize newlines to LF for hashing
    const normalizedLegacy = legacyBlock.replace(/\r\n/g, '\n');
    const legacyHash = crypto.createHash('sha256').update(normalizedLegacy).digest('hex');

    if (D621E65_HASHES.has(legacyHash)) {
      // Replace legacy block with fullMarkedBlock
      updatedContent = existingContent.replace(legacyMatch[0], fullMarkedBlock);
      legacyMigrated = true;
    } else {
      warnings.push('Legacy unversioned rules block has been modified; skipping automatic replacement to avoid overwriting custom changes.');
    }
  }

  // Update or append versioned sections
  if (!legacyMigrated) {
    for (const sec of sections) {
      const secRegex = new RegExp(`<!-- frontend-kit:${sec.name}[^>]*-->[\\s\\S]*?<!-- \\/frontend-kit:${sec.name} -->`);
      const markedSection = `${sec.markerStart}\n${sec.body}\n${sec.markerEnd}`;

      if (secRegex.test(updatedContent)) {
        updatedContent = updatedContent.replace(secRegex, markedSection);
      } else {
        // Section not present in file: append it
        if (updatedContent.trim().length > 0) {
          updatedContent = updatedContent.trimEnd() + '\n\n' + markedSection + '\n';
        } else {
          updatedContent = markedSection + '\n';
        }
      }
    }
  }

  // Ensure trailing newline
  if (!updatedContent.endsWith('\n')) {
    updatedContent += '\n';
  }

  // Write target file using safeWriteFile
  const writeResult = safeWriteFile(targetFullPath, updatedContent, {
    dryRun: options.dryRun,
  });

  // If we also need to create CLAUDE.md with @AGENTS.md
  let claudeMdCreated = false;
  if (needClaudeImportFile && !fs.existsSync(claudePath)) {
    safeWriteFile(claudePath, '@AGENTS.md\n', { dryRun: options.dryRun });
    claudeMdCreated = true;
  }

  return {
    success: true,
    gatePassed: true,
    targetPath: path.relative(resolvedDir, targetFullPath).replace(/\\/g, '/'),
    targetCreated: !targetExisted,
    claudeMdCreated,
    changed: writeResult.changed,
    sections: sections.map((s) => s.name),
    placeholders,
    legacyMigrated,
    warnings,
  };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let targetDir = '.';
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--print') options.print = true;
    else if (arg === '--gate') options.gate = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--gsap' && args[i + 1]) {
      options.gsap = args[++i];
    } else if (arg === '--3d' && args[i + 1]) {
      options.threeD = args[++i];
    } else if (arg === '--target' && args[i + 1]) {
      options.target = args[++i];
    } else if (!arg.startsWith('--')) {
      targetDir = arg;
    }
  }

  try {
    const res = writeRules(targetDir, options);

    if (options.gate && res.gatePassed === false) {
      console.log(res.message);
      process.exit(0);
    }

    if (options.print) {
      console.log(res.printText);
      process.exit(0);
    }

    if (options.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      if (res.changed) {
        console.log(`Updated rules in ${res.targetPath}`);
      } else {
        console.log(`Rules in ${res.targetPath} are unchanged`);
      }
      if (res.claudeMdCreated) {
        console.log(`Created CLAUDE.md with @AGENTS.md import`);
      }
      for (const w of res.warnings) {
        console.warn(`Warning: ${w}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(err.code || 1);
  }
}
