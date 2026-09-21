#!/usr/bin/env node

// Deterministic candidate finder for the frontend-kit reviewer.
//
// Usage:
//   node review-scan.mjs <project-dir> [file ...] [--json] [--all]
//
// With no file arguments it scans what git reports as changed (tracked
// modifications plus untracked files). --all scans the whole app/src tree.
//
// Every finding is a *candidate*: the agent confirms it by reading the file.
// Exit code is 0 unless the scan itself failed (2), so a reviewer run never
// fails a build by itself.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PALETTE_FAMILIES,
  COLOR_UTILITIES,
  ICON_PACKAGES,
  UNSAFE_CODE,
  REMOTE_ASSET,
  lineOf,
  hasUseClient,
  classStrings,
} from './lib/code-patterns.mjs';

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };
export const CATEGORY = { KIT: 'kit-rule', SLOP: 'ai-slop', REGISTRY: 'third-party' };

const CODE_EXT = new Set(['.tsx', '.jsx']);
const STYLE_EXT = new Set(['.css']);

function finding(id, severity, category, file, line, message, fix) {
  return { id, severity, category, file, line, message, fix };
}

function scanCodeFile(relPath, content, context) {
  const findings = [];
  const push = (...args) => findings.push(finding(...args));
  const isClient = hasUseClient(content);
  const classes = classStrings(content);

  // --- kit rules ---------------------------------------------------------

  // Tailwind only emits classes it can see as literal text.
  // `bg-status-${state}` and `"bg-" + state` both defeat Tailwind's scanner.
  const dynamic = /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-[\w-]*\$\{|["'`](?:bg|text|border|ring)-[\w-]*["'`]\s*\+/g;
  for (const m of content.matchAll(dynamic)) {
    push('dynamic-token-class', SEVERITY.ERROR, CATEGORY.KIT, relPath, lineOf(content, m.index),
      'Class name is built at runtime; Tailwind never emits it.',
      'Map states to full class names: const DOT = { live: "bg-status-live", … } as const.');
  }

  const threeImport = /from\s+["'](three|@react-three\/[^"']+|@\/components\/systems\/systems-3d-canvas)["']/g;
  for (const m of content.matchAll(threeImport)) {
    if (isClient) continue;
    const inAppRoute = /(^|\/)(page|layout|template|default)\.[jt]sx$/.test(relPath);
    push('three-in-server-component', inAppRoute ? SEVERITY.ERROR : SEVERITY.WARNING, CATEGORY.KIT,
      relPath, lineOf(content, m.index),
      'three/@react-three imported in a file without "use client".',
      'Import { Systems3DCanvas } from "@/components/systems/canvas-lazy" instead.');
  }

  const effect = /use(?:Layout)?Effect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]{0,1200}?)\n\s*\}/g;
  for (const m of content.matchAll(effect)) {
    if (/\bgsap\.(?:to|from|fromTo|set|timeline)\b|\bScrollTrigger\.create\b/.test(m[1])) {
      push('gsap-in-useeffect', SEVERITY.ERROR, CATEGORY.KIT, relPath, lineOf(content, m.index),
        'GSAP animation created inside useEffect; tweens and ScrollTriggers leak on unmount.',
        'Use useGSAP(() => { … }, { scope: containerRef }) from @gsap/react.');
    }
  }

  for (const { value, index } of classes) {
    const arbitrary = new RegExp(`\\b(?:${COLOR_UTILITIES})-\\[(?:#|rgb|hsl|oklch|color:)`);
    const palette = new RegExp(`\\b(?:${COLOR_UTILITIES})-(?:${PALETTE_FAMILIES})-\\d{2,3}\\b`);
    if (arbitrary.test(value) || palette.test(value)) {
      push('raw-color-class', SEVERITY.WARNING, CATEGORY.KIT, relPath, lineOf(content, index),
        'Raw color in className instead of a semantic token.',
        'Use bg-background, bg-card, text-muted-foreground, border-border, bg-status-*.');
    }

    // Quotes count as boundaries: inside cn("...") the class list starts and ends with one.
    for (const s of value.matchAll(/(?:^|[\s"'`])((?:[a-z]+:)?)w-([\w./%-]+?)(?=[\s"'`]|$)/g)) {
      const variant = s[1];
      const size = s[2];
      const escaped = size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:^|[\\s"'\`])${variant}h-${escaped}(?:[\\s"'\`]|$)`).test(value)) {
        push('size-shorthand', SEVERITY.INFO, CATEGORY.KIT, relPath, lineOf(content, index),
          `\`${variant}w-${size} ${variant}h-${size}\` can be \`${variant}size-${size}\`.`,
          'Prefer size-N so width and height cannot drift apart.');
      }
    }
  }

  // A status color with no words next to it is invisible to anyone who cannot
  // distinguish the hues.
  for (const m of content.matchAll(/<(\w+)([^>]*\b(?:bg|text|border)-status-(?:live|warning|error)\b[^>]*?)(\/?)>/g)) {
    const selfClosing = m[3] === '/';
    // Only look at what sits immediately after the dot: a label further down
    // the file belongs to some other row.
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const inlineLabel = /aria-label=|title=|sr-only/.test(m[2]);
    const childText = !selfClosing && /[A-Za-z]{2,}/.test((after.split('<')[0] ?? '').trim());
    // The label can be the next element's text: a heading, badge, label or
    // plain sibling text all count. (The kit's own error.tsx pairs the dot
    // with an <h2>, and used to trip this check.)
    const immediateSibling = /^\s*(?:<(?:span|p|div|h[1-6]|strong|small|label|Badge|Button|Label)[^>]*>\s*)?[A-Za-z]{2,}/.test(after);
    if (!inlineLabel && !childText && !immediateSibling) {
      push('status-color-no-label', SEVERITY.WARNING, CATEGORY.KIT, relPath, lineOf(content, m.index),
        'Status color carries meaning with no text label beside it.',
        'Pair the dot with a word (Live, Degraded, Down) or add aria-label / sr-only text.');
    }
  }

  for (const m of content.matchAll(/from\s+["']next\/font\/google["']/g)) {
    const geist = /\b(Geist|Geist_Mono)\b/.test(content);
    push('next-font-google', geist ? SEVERITY.WARNING : SEVERITY.INFO, CATEGORY.KIT, relPath, lineOf(content, m.index),
      geist
        ? 'Geist loaded from Google Fonts; builds then depend on the network.'
        : 'Font loaded from Google Fonts.',
      geist ? 'Use the self-hosted geist package (geist/font/sans, geist/font/mono).' : 'Consider a self-hosted @fontsource-variable package.');
  }

  for (const m of content.matchAll(/from\s+["']framer-motion["']/g)) {
    push('framer-motion-import', SEVERITY.WARNING, CATEGORY.KIT, relPath, lineOf(content, m.index),
      'framer-motion is the legacy package name.',
      'Import from "motion/react".');
  }

  if (/from\s+["']motion\/react["']/.test(content) && !/useReducedMotion|MotionConfig|motion-reduce:/.test(content) && !context.hasGlobalMotionConfig) {
    const m = content.match(/from\s+["']motion\/react["']/);
    push('missing-reduced-motion', SEVERITY.WARNING, CATEGORY.KIT, relPath, lineOf(content, m.index),
      'Motion used without any reduced-motion handling.',
      'Gate movement with useReducedMotion(), or wrap the tree in <MotionConfig reducedMotion="user">.');
  }

  // --- AI slop -----------------------------------------------------------

  for (const { value, index } of classes) {
    if (/bg-clip-text/.test(value) && /text-transparent/.test(value) && /bg-(?:gradient|linear)-/.test(value)) {
      push('slop-gradient-text', SEVERITY.WARNING, CATEGORY.SLOP, relPath, lineOf(content, index),
        'Gradient text is one of the most recognisable AI-template tells.',
        'Use weight or size for emphasis.');
    }

    const purple = new RegExp(`\\b(?:${COLOR_UTILITIES})-(?:violet|purple|indigo|fuchsia)-\\d{2,3}\\b`);
    if (purple.test(value) && !['violet', 'indigo', 'purple', 'fuchsia'].includes(context.accent)) {
      push('slop-default-purple', SEVERITY.WARNING, CATEGORY.SLOP, relPath, lineOf(content, index),
        `Default AI purple/indigo, and it is not this project's accent.`,
        `Use bg-primary / text-primary (project accent: ${context.accent ?? 'none'}).`);
    }

    if (/shadow-black\b/.test(value) || /shadow-\[[^\]]*rgba\(0,\s*0,\s*0,\s*0?\.[3-9]/.test(value)) {
      push('slop-black-shadow', SEVERITY.INFO, CATEGORY.SLOP, relPath, lineOf(content, index),
        'Pure black shadow reads as a sticker on a light surface.',
        'Tint the shadow toward the surface hue, or use a border.');
    }
  }

  const radiusScales = new Set();
  for (const { value } of classes) {
    for (const m of value.matchAll(/\brounded-(none|sm|md|lg|xl|2xl|3xl|full)\b/g)) radiusScales.add(m[1]);
  }
  if (radiusScales.size > 2) {
    push('slop-mixed-radius', SEVERITY.INFO, CATEGORY.SLOP, relPath, 1,
      `Three or more radius scales in one file (${[...radiusScales].join(', ')}).`,
      'Pick one radius scale per project; /frontend-kit:theme radius=<scale> sets the token.');
  }

  const usedIconPkgs = ICON_PACKAGES.filter((pkg) => new RegExp(`from\\s+["']${pkg.replace('/', '\\/')}`).test(content));
  if (usedIconPkgs.length > 1) {
    push('slop-mixed-icons', SEVERITY.WARNING, CATEGORY.SLOP, relPath, 1,
      `More than one icon library in one file (${usedIconPkgs.join(', ')}).`,
      'Keep one icon family per project.');
  }

  for (const m of content.matchAll(/<Card\b[\s\S]{0,400}?<Card\b/g)) {
    push('slop-nested-card', SEVERITY.INFO, CATEGORY.SLOP, relPath, lineOf(content, m.index),
      'Card nested directly inside another Card.',
      'Nested cards flatten hierarchy; group with a border or spacing instead.');
  }

  // Emoji used where an icon belongs: inside a button, link or heading.
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const m of content.matchAll(/<(button|a|h[1-6]|Button)\b[^>]*>([\s\S]{0,160}?)<\/\1>/g)) {
    if (emoji.test(m[2])) {
      push('slop-emoji-icon', SEVERITY.WARNING, CATEGORY.SLOP, relPath, lineOf(content, m.index),
        'Emoji used as an icon in an interactive element or heading.',
        'Use an icon from the project icon set; screen readers announce emoji literally.');
    }
  }

  // --- effects budget ----------------------------------------------------

  if (context.effects?.size) {
    const used = [];
    for (const m of content.matchAll(/^\s*import\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)) {
      const info = context.effects.get(m[1].split('/').pop());
      if (info && (m[1].startsWith('@/') || m[1].startsWith('.') || m[1].startsWith('~/'))) {
        used.push({ ...info, line: lineOf(content, m.index) });
      }
    }
    const ambient = used.filter((u) => u.kind === 'ambient');
    if (ambient.length > 1) {
      push('effect-budget-ambient', SEVERITY.WARNING, CATEGORY.KIT, relPath, ambient[1].line,
        `${ambient.length} ambient background effects in one file (${ambient.map((a) => a.item).join(', ')}).`,
        'Keep one ambient background per page; drop the others or move them to another section.');
    }
    if (APP_ROUTE.test(relPath) || /\bSidebar(?:Provider|Inset)\b/.test(content)) {
      for (const u of used.filter((x) => !x.dashboardOk)) {
        push('effect-in-dashboard', SEVERITY.WARNING, CATEGORY.KIT, relPath, u.line,
          `Decorative effect ${u.item} on a dashboard or app route.`,
          'Keep app screens calm; a number ticker is the only effect that belongs here.');
      }
    }
  }

  // --- third-party registry code ----------------------------------------

  for (const m of content.matchAll(UNSAFE_CODE)) {
    push('registry-unsafe-eval', SEVERITY.WARNING, CATEGORY.REGISTRY, relPath, lineOf(content, m.index),
      'Dynamic HTML or code evaluation.',
      'Review this before shipping; registry components sometimes ship it unnecessarily.');
  }
  for (const m of content.matchAll(REMOTE_ASSET)) {
    push('registry-remote-asset', SEVERITY.WARNING, CATEGORY.REGISTRY, relPath, lineOf(content, m.index),
      `Loads a remote asset from ${m[1]}.`,
      'Self-host it or confirm the host is intentional.');
  }

  return findings;
}

function scanStyleFile(relPath, content, context) {
  const findings = [];
  if (!/globals?\.css$/.test(relPath)) return findings;
  const known = context.knownTokenValues;
  if (!known || known.size === 0) return findings;

  for (const m of content.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gim)) {
    const [, name, rawValue] = m;
    if (!known.has(name)) continue;
    const value = rawValue.trim();
    if (!known.get(name).has(value)) {
      findings.push(finding('token-hand-edit', SEVERITY.INFO, CATEGORY.KIT, relPath, lineOf(content, m.index),
        `--${name} no longer matches any kit palette or default.`,
        'Change tokens with /frontend-kit:theme, or keep them with --keep so a later run does not revert them.'));
    }
  }
  return findings;
}

function gitChangedFiles(projectDir) {
  try {
    const out = execFileSync('git', ['-C', projectDir, 'status', '--porcelain'], { encoding: 'utf8' });
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter((p) => !p.endsWith('/'));
  } catch {
    return [];
  }
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function buildKnownTokenValues(pluginRoot) {
  const map = new Map();
  const dir = path.join(pluginRoot, 'scripts', 'palettes');
  if (!fs.existsSync(dir)) return map;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const mode of ['light', 'dark']) {
      for (const [name, value] of Object.entries(data[mode] ?? {})) {
        if (!map.has(name)) map.set(name, new Set());
        map.get(name).add(String(value).trim());
      }
    }
  }
  return map;
}

// File name of an installed effect (e.g. "background-beams") -> its catalog kind. Items the
// project recorded in .frontend-kit.json win over catalog names, which can collide.
function buildEffectMap(pluginRoot, kitState) {
  const map = new Map();
  let catalog = { needs: [] };
  try {
    catalog = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'catalog', 'effects.json'), 'utf8'));
  } catch {
    return map;
  }
  const byItem = new Map();
  for (const need of catalog.needs) {
    for (const c of need.candidates) byItem.set(c.item, { item: c.item, kind: need.kind, dashboardOk: need.dashboardOk });
  }
  for (const [item, info] of byItem) map.set(item.split('/')[1], info);
  for (const recorded of kitState.registryItems ?? []) {
    const info = byItem.get(recorded.item);
    if (!info) continue;
    for (const f of recorded.files ?? []) map.set(path.posix.basename(f).replace(/\.[jt]sx?$/, ''), info);
  }
  return map;
}

const APP_ROUTE = /(?:^|\/)(?:dashboard|admin|settings|\(dashboard\)|\(app\))\//;

export function reviewScan(projectDir, files = [], options = {}) {
  const resolved = path.resolve(projectDir);
  const pluginRoot = path.resolve(import.meta.dirname, '..');

  let targets = files.length > 0 ? files : gitChangedFiles(resolved);
  if (options.all || (targets.length === 0 && files.length === 0)) {
    targets = ['src', 'app', 'components']
      .flatMap((d) => walk(path.join(resolved, d)))
      .map((p) => path.relative(resolved, p));
  }

  const kitState = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(resolved, '.frontend-kit.json'), 'utf8'));
    } catch {
      return {};
    }
  })();

  const layoutCandidates = ['src/app/layout.tsx', 'app/layout.tsx', 'src/app/providers.tsx', 'app/providers.tsx'];
  const hasGlobalMotionConfig = layoutCandidates.some((rel) => {
    const full = path.join(resolved, rel);
    return fs.existsSync(full) && /MotionConfig/.test(fs.readFileSync(full, 'utf8'));
  });

  const context = {
    accent: kitState.accent ?? 'none',
    hasGlobalMotionConfig,
    knownTokenValues: buildKnownTokenValues(pluginRoot),
    effects: buildEffectMap(pluginRoot, kitState),
  };

  const findings = [];
  const scanned = [];
  const skipped = [];

  for (const rel of targets) {
    const full = path.isAbsolute(rel) ? rel : path.join(resolved, rel);
    const ext = path.extname(full);
    if (!CODE_EXT.has(ext) && !STYLE_EXT.has(ext)) continue;
    if (!fs.existsSync(full)) {
      skipped.push({ file: rel, reason: 'not found' });
      continue;
    }
    const relPath = path.relative(resolved, full).replace(/\\/g, '/');
    const content = fs.readFileSync(full, 'utf8');
    scanned.push(relPath);
    findings.push(
      ...(CODE_EXT.has(ext) ? scanCodeFile(relPath, content, context) : scanStyleFile(relPath, content, context))
    );
  }

  // Project-level: route boundaries.
  const appDir = ['src/app', 'app'].map((d) => path.join(resolved, d)).find((d) => fs.existsSync(d));
  if (appDir && options.projectChecks !== false) {
    const missing = ['error.tsx', 'loading.tsx', 'not-found.tsx'].filter((f) => !fs.existsSync(path.join(appDir, f)));
    if (missing.length > 0) {
      findings.push(finding('missing-route-boundaries', SEVERITY.WARNING, CATEGORY.KIT,
        path.relative(resolved, appDir).replace(/\\/g, '/'), 1,
        `Route segment has no ${missing.join(', ')}.`,
        'Run /frontend-kit:adopt (or copy templates/boundaries) so failures and slow loads have a UI.'));
    }
  }

  // className={cn("...")} is read both as an attribute and as a cn() call; report it once.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const key = `${f.id}\0${f.file}\0${f.line}\0${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  findings.length = 0;
  findings.push(...unique);

  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

  const counts = {
    error: findings.filter((f) => f.severity === SEVERITY.ERROR).length,
    warning: findings.filter((f) => f.severity === SEVERITY.WARNING).length,
    info: findings.filter((f) => f.severity === SEVERITY.INFO).length,
  };

  return {
    projectDir: resolved,
    scanned,
    skipped,
    counts,
    verdict: counts.error > 0 ? 'fail' : counts.warning + counts.info > 0 ? 'pass_with_notes' : 'pass',
    findings,
  };
}

export function formatReport(result) {
  const lines = [];
  lines.push(`Verdict: ${result.verdict}`);
  lines.push(
    `Scope: ${result.scanned.length} file(s) · ${result.counts.error} error · ${result.counts.warning} warning · ${result.counts.info} info`
  );
  for (const [severity, title] of [['error', 'Errors'], ['warning', 'Warnings'], ['info', 'Info']]) {
    const group = result.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push('', `## ${title}`);
    for (const f of group) {
      lines.push(`- ${f.file}:${f.line} [${f.id}] (${f.category}) ${f.message}`);
      lines.push(`  Fix: ${f.fix}`);
    }
  }
  if (result.skipped.length > 0) {
    lines.push('', `Not checked: ${result.skipped.map((s) => `${s.file} (${s.reason})`).join(', ')}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const all = args.includes('--all');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [dir, ...files] = positional;

  if (!dir) {
    console.error('usage: review-scan.mjs <project-dir> [file ...] [--json] [--all]');
    process.exit(2);
  }

  try {
    const result = reviewScan(dir, files, { all });
    console.log(json ? JSON.stringify(result, null, 2) : formatReport(result));
  } catch (error) {
    console.error(`review-scan: ${error.message}`);
    process.exit(2);
  }
}
