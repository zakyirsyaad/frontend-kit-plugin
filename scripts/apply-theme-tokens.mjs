#!/usr/bin/env node
/**
 * scripts/apply-theme-tokens.mjs
 * Theme application engine (v2) for Tailwind v4 + shadcn projects.
 *
 * Usage:
 *   node apply-theme-tokens.mjs <project-dir> [--palette zinc] [--css <path>] [--keep a,b] [--force]
 *        [--root-scheme auto|light|dark] [--font-sans geist|var(--x)|none] [--no-status]
 *        [--no-components-json] [--dry-run] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { findTopLevelBlock } from './lib/css-blocks.mjs';
import { safeWriteFile, EXIT_CODES } from './lib/fs-safe.mjs';
import {
  getAccentTokens,
  RADIUS_PRESETS,
} from './lib/identity.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PALETTES_DIR = path.join(__dirname, 'palettes');

// A block is "on" a palette when at least half of its declared (non-accent) tokens carry that
// palette's values; only then are its tokens safe-mode replaceable.
const SOURCE_PALETTE_MIN_MATCH = 0.5;
const ACCENT_OWNED = new Set(['primary', 'primary-foreground', 'ring', 'chart-1', 'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-ring']);

export const STATUS_TOKENS = Object.freeze({
  light: {
    'status-live': 'oklch(0.627 0.194 149.214)',
    'status-warning': 'oklch(0.666 0.179 58.318)',
    'status-error': 'oklch(0.577 0.245 27.325)',
  },
  dark: {
    'status-live': 'oklch(0.723 0.219 149.579)',
    'status-warning': 'oklch(0.769 0.188 70.08)',
    'status-error': 'oklch(0.704 0.191 22.216)',
  },
});

// Reference Zinc tokens from v0 baseline (d621e65)
export const LIGHT = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.141 0.005 285.823)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.141 0.005 285.823)",
  popover: "oklch(1 0 0)",
  "popover-foreground": "oklch(0.141 0.005 285.823)",
  primary: "oklch(0.21 0.006 285.885)",
  "primary-foreground": "oklch(0.985 0 0)",
  secondary: "oklch(0.967 0.001 286.375)",
  "secondary-foreground": "oklch(0.21 0.006 285.885)",
  muted: "oklch(0.967 0.001 286.375)",
  "muted-foreground": "oklch(0.552 0.016 285.938)",
  accent: "oklch(0.967 0.001 286.375)",
  "accent-foreground": "oklch(0.21 0.006 285.885)",
  destructive: "oklch(0.577 0.245 27.325)",
  border: "oklch(0.92 0.004 286.32)",
  input: "oklch(0.92 0.004 286.32)",
  ring: "oklch(0.705 0.015 286.067)",
  "status-live": "oklch(0.627 0.194 149.214)",
  "status-warning": "oklch(0.666 0.179 58.318)",
  "status-error": "oklch(0.577 0.245 27.325)",
  "chart-1": "oklch(0.871 0.006 286.286)",
  "chart-2": "oklch(0.552 0.016 285.938)",
  "chart-3": "oklch(0.442 0.017 285.786)",
  "chart-4": "oklch(0.37 0.013 285.805)",
  "chart-5": "oklch(0.274 0.006 286.033)",
  sidebar: "oklch(0.985 0 0)",
  "sidebar-foreground": "oklch(0.141 0.005 285.823)",
  "sidebar-primary": "oklch(0.21 0.006 285.885)",
  "sidebar-primary-foreground": "oklch(0.985 0 0)",
  "sidebar-accent": "oklch(0.967 0.001 286.375)",
  "sidebar-accent-foreground": "oklch(0.21 0.006 285.885)",
  "sidebar-border": "oklch(0.92 0.004 286.32)",
  "sidebar-ring": "oklch(0.705 0.015 286.067)",
};

export const DARK = {
  background: "oklch(0.141 0.005 285.823)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.21 0.006 285.885)",
  "card-foreground": "oklch(0.985 0 0)",
  popover: "oklch(0.21 0.006 285.885)",
  "popover-foreground": "oklch(0.985 0 0)",
  primary: "oklch(0.92 0.004 286.32)",
  "primary-foreground": "oklch(0.21 0.006 285.885)",
  secondary: "oklch(0.274 0.006 286.033)",
  "secondary-foreground": "oklch(0.985 0 0)",
  muted: "oklch(0.274 0.006 286.033)",
  "muted-foreground": "oklch(0.705 0.015 286.067)",
  accent: "oklch(0.274 0.006 286.033)",
  "accent-foreground": "oklch(0.985 0 0)",
  destructive: "oklch(0.704 0.191 22.216)",
  border: "oklch(1 0 0 / 10%)",
  input: "oklch(1 0 0 / 15%)",
  ring: "oklch(0.552 0.016 285.938)",
  "status-live": "oklch(0.723 0.219 149.579)",
  "status-warning": "oklch(0.769 0.188 70.08)",
  "status-error": "oklch(0.704 0.191 22.216)",
  "chart-1": "oklch(0.871 0.006 286.286)",
  "chart-2": "oklch(0.552 0.016 285.938)",
  "chart-3": "oklch(0.442 0.017 285.786)",
  "chart-4": "oklch(0.37 0.013 285.805)",
  "chart-5": "oklch(0.274 0.006 286.033)",
  sidebar: "oklch(0.21 0.006 285.885)",
  "sidebar-foreground": "oklch(0.985 0 0)",
  "sidebar-primary": "oklch(0.488 0.243 264.376)",
  "sidebar-primary-foreground": "oklch(0.985 0 0)",
  "sidebar-accent": "oklch(0.274 0.006 286.033)",
  "sidebar-accent-foreground": "oklch(0.985 0 0)",
  "sidebar-border": "oklch(1 0 0 / 10%)",
  "sidebar-ring": "oklch(0.552 0.016 285.938)",
};

let _cachedPalettes = null;

export function loadPalettes() {
  if (_cachedPalettes) return _cachedPalettes;

  const palettes = new Map();
  if (fs.existsSync(PALETTES_DIR)) {
    const files = fs.readdirSync(PALETTES_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const name = path.basename(f, '.json');
      const data = JSON.parse(fs.readFileSync(path.join(PALETTES_DIR, f), 'utf8'));
      palettes.set(name, data);
    }
  }

  _cachedPalettes = palettes;
  return palettes;
}

export function isOklchDark(value) {
  // Parses oklch(L C H ...) and checks lightness < 0.5
  const match = value.match(/oklch\(\s*([\d.]+)/i);
  if (!match) return false;
  const l = parseFloat(match[1]);
  return l < 0.5;
}

export function applyTheme(css, options = {}) {
  const {
    palette: paletteName = 'zinc',
    force = false,
    keep = [],
    rootScheme = 'auto',
    fontSans = null,
    status = true,
    accent = null,
    radius = null,
    displayFont = null,
  } = options;

  const keepSet = new Set(Array.isArray(keep) ? keep : keep.split(',').map((k) => k.trim()));
  const allPalettes = loadPalettes();

  if (!allPalettes.has(paletteName)) {
    const available = Array.from(allPalettes.keys()).sort().join(', ');
    throw new Error(
      `Unknown palette '${paletteName}'. Available palettes: ${available}`
    );
  }

  // Pre-check for HSL-wrapped tokens (Tailwind v3 legacy / incompatible)
  if (/hsl\(var\(--/i.test(css)) {
    const err = new Error(
      'Unsupported CSS: detected HSL-wrapped variables `hsl(var(--...))`. Project must use Tailwind v4 OKLCH tokens.'
    );
    err.code = EXIT_CODES.UNSUPPORTED;
    throw err;
  }

  // Check required blocks
  const rootBlock = findTopLevelBlock(css, ':root');
  if (!rootBlock) {
    throw new Error('no `:root { ... }` block found — run shadcn init first');
  }

  const themeBlock = findTopLevelBlock(css, '@theme inline');
  if (!themeBlock) {
    throw new Error('no `@theme inline { ... }` block found — is this a Tailwind v4 shadcn project?');
  }

  const darkBlock = findTopLevelBlock(css, '.dark');

  // Detect CRLF line endings
  const isCrlf = css.includes('\r\n');
  const newline = isCrlf ? '\r\n' : '\n';

  // Build snapshot values map to detect unmodified tokens across all 9 palettes
  const snapshotValuesByMode = {
    light: new Map(), // tokenName -> Set of standard values
    dark: new Map(),
  };

  for (const p of allPalettes.values()) {
    for (const [k, v] of Object.entries(p.light)) {
      if (!snapshotValuesByMode.light.has(k)) snapshotValuesByMode.light.set(k, new Set());
      snapshotValuesByMode.light.get(k).add(v);
    }
    for (const [k, v] of Object.entries(p.dark)) {
      if (!snapshotValuesByMode.dark.has(k)) snapshotValuesByMode.dark.set(k, new Set());
      snapshotValuesByMode.dark.get(k).add(v);
    }
  }

  // Add status token defaults
  for (const [k, v] of Object.entries(STATUS_TOKENS.light)) {
    if (!snapshotValuesByMode.light.has(k)) snapshotValuesByMode.light.set(k, new Set());
    snapshotValuesByMode.light.get(k).add(v);
  }
  for (const [k, v] of Object.entries(STATUS_TOKENS.dark)) {
    if (!snapshotValuesByMode.dark.has(k)) snapshotValuesByMode.dark.set(k, new Set());
    snapshotValuesByMode.dark.get(k).add(v);
  }

  // Add standard radius preset values
  if (!snapshotValuesByMode.light.has('radius')) snapshotValuesByMode.light.set('radius', new Set());
  if (!snapshotValuesByMode.dark.has('radius')) snapshotValuesByMode.dark.set('radius', new Set());
  for (const rVal of Object.values(RADIUS_PRESETS)) {
    snapshotValuesByMode.light.get('radius').add(rVal);
    snapshotValuesByMode.dark.get('radius').add(rVal);
  }

  // Parse accent tokens if requested
  let accentResult = null;
  if (accent && accent !== 'none') {
    accentResult = getAccentTokens(accent);
    if (accentResult.warning) {
      warnings.push(accentResult.warning);
    }
  }

  const targetPalette = allPalettes.get(paletteName);

  // Determine root scheme
  let effectiveRootScheme = rootScheme;
  if (effectiveRootScheme === 'auto') {
    const bgMatch = rootBlock.body.match(/--background:\s*([^;]+);/);
    if (bgMatch && isOklchDark(bgMatch[1].trim()) && !darkBlock) {
      effectiveRootScheme = 'dark';
    } else {
      effectiveRootScheme = 'light';
    }
  }

  const warnings = [];
  const replaced = [];
  const appended = [];
  const skippedCustom = [];
  const kept = [];
  const registered = [];

  // Values that count as "not customised" for one block. Only palettes the block is
  // actually on qualify: pooling all nine made a brand color that happens to equal some
  // other palette's value (a brand navy background equal to gray's dark background) look
  // standard, so safe mode replaced it. Accent-owned tokens do not say which palette a
  // block is on, so they are left out of the match.
  function standardValuesFor(currentBody, mode) {
    const declared = new Map(
      [...currentBody.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
    const standard = new Map();
    const add = (k, v) => {
      if (!standard.has(k)) standard.set(k, new Set());
      standard.get(k).add(v);
    };
    for (const p of allPalettes.values()) {
      const values = p[mode] ?? {};
      const compared = [...declared.keys()].filter((k) => k in values && !ACCENT_OWNED.has(k));
      if (!compared.length) continue;
      const matched = compared.filter((k) => declared.get(k) === values[k]).length;
      if (matched / compared.length < SOURCE_PALETTE_MIN_MATCH) continue;
      for (const [k, v] of Object.entries(values)) add(k, v);
    }
    // Kit-owned values are always safe to replace.
    for (const [k, v] of Object.entries(STATUS_TOKENS[mode] ?? {})) add(k, v);
    for (const v of Object.values(RADIUS_PRESETS)) add('radius', v);
    // Accent values written by the identity layer stay replaceable, as before.
    for (const [k, values] of snapshotValuesByMode[mode]) {
      if (ACCENT_OWNED.has(k)) for (const v of values) add(k, v);
    }
    return standard;
  }

  // Helper to patch a block
  function patchBlockDeclarations(currentBody, mode, tokensToApply) {
    let body = currentBody;
    const standardValues = standardValuesFor(currentBody, mode);

    for (const [name, value] of Object.entries(tokensToApply)) {
      if (keepSet.has(name)) {
        kept.push(name);
        continue;
      }

      const decl = `--${name}: ${value};`;
      const regex = new RegExp(`--${name}:[^;]*;(?:[ \\t]*/\\*[^*]*\\*/)?`);
      const existingMatch = regex.exec(body);

      if (existingMatch) {
        // Extract current value
        const fullExisting = existingMatch[0];
        const colonIdx = fullExisting.indexOf(':');
        const semiIdx = fullExisting.indexOf(';');
        const currentValue = fullExisting.slice(colonIdx + 1, semiIdx).trim();

        if (currentValue === value) {
          // Already matches target value
          continue;
        }

        // Safe replacement check
        const knownValues = standardValues.get(name);
        const isStandard = knownValues && knownValues.has(currentValue);

        if (!force && !isStandard) {
          skippedCustom.push(name);
          continue;
        }

        body = body.replace(regex, decl);
        replaced.push(`${mode}.${name}`);
      } else {
        // Append missing declaration
        body = `${body.replace(/\s*$/, '')}${newline}  ${decl}${newline}`;
        appended.push(`${mode}.${name}`);
      }
    }

    return body;
  }

  // Tokens for root
  const rootMode = effectiveRootScheme === 'dark' ? 'dark' : 'light';
  const rootTokens = { ...targetPalette[rootMode] };
  if (accentResult) {
    Object.assign(rootTokens, accentResult[rootMode]);
  }
  if (status) {
    Object.assign(rootTokens, STATUS_TOKENS[rootMode]);
  }
  if (radius) {
    if (radius in RADIUS_PRESETS) {
      rootTokens.radius = RADIUS_PRESETS[radius];
      if (radius === 'pill') {
        rootTokens['radius-control'] = '9999px';
      }
    } else {
      throw new Error(
        `Unknown radius '${radius}'. Available presets: ${Object.keys(RADIUS_PRESETS).join(', ')}`
      );
    }
  }

  // Patch :root
  // Re-fetch range using findTopLevelBlock on the latest css
  let currentCss = css;
  let curRoot = findTopLevelBlock(currentCss, ':root');
  const patchedRootBody = patchBlockDeclarations(curRoot.body, rootMode, rootTokens);
  currentCss = currentCss.slice(0, curRoot.bodyStart) + patchedRootBody + currentCss.slice(curRoot.bodyEnd);

  // Patch .dark if present
  let curDark = findTopLevelBlock(currentCss, '.dark');
  if (curDark) {
    const darkTokens = { ...targetPalette.dark };
    if (accentResult) {
      Object.assign(darkTokens, accentResult.dark);
    }
    if (status) {
      Object.assign(darkTokens, STATUS_TOKENS.dark);
    }
    const patchedDarkBody = patchBlockDeclarations(curDark.body, 'dark', darkTokens);
    currentCss = currentCss.slice(0, curDark.bodyStart) + patchedDarkBody + currentCss.slice(curDark.bodyEnd);
  } else if (effectiveRootScheme === 'light') {
    warnings.push('No `.dark` block found; dark mode tokens were not written.');
  }

  // Register status colors in @theme inline if enabled
  if (status) {
    let curTheme = findTopLevelBlock(currentCss, '@theme inline');
    let themeBody = curTheme.body;

    for (const name of ['status-live', 'status-warning', 'status-error']) {
      if (!themeBody.includes(`--color-${name}:`)) {
        themeBody = `${themeBody.replace(/\s*$/, '')}${newline}  --color-${name}: var(--${name});${newline}`;
        registered.push(`--color-${name}`);
      }
    }

    currentCss = currentCss.slice(0, curTheme.bodyStart) + themeBody + currentCss.slice(curTheme.bodyEnd);
  }

  // Wire font-sans if requested
  let fontSansResult = null;
  if (fontSans) {
    let curTheme = findTopLevelBlock(currentCss, '@theme inline');
    let themeBody = curTheme.body;

    const fontMatch = themeBody.match(/--font-sans:\s*([^;]+);/);
    const fromFont = fontMatch ? fontMatch[1].trim() : null;
    let targetFontVar = null;

    if (fontSans === 'geist') {
      targetFontVar = 'var(--font-geist-sans)';
    } else if (fontSans.startsWith('var(')) {
      targetFontVar = fontSans;
    } else if (fontSans !== 'none') {
      targetFontVar = `var(${fontSans})`;
    }

    if (targetFontVar && fromFont !== targetFontVar) {
      if (/--font-sans:\s*var\(--font-sans\);/.test(themeBody)) {
        themeBody = themeBody.replace(
          /--font-sans:\s*var\(--font-sans\);/,
          `--font-sans: ${targetFontVar};`
        );
      } else if (fontMatch) {
        themeBody = themeBody.replace(
          /--font-sans:\s*[^;]+;/,
          `--font-sans: ${targetFontVar};`
        );
      } else {
        themeBody = `${themeBody.replace(/\s*$/, '')}${newline}  --font-sans: ${targetFontVar};${newline}`;
      }

      currentCss = currentCss.slice(0, curTheme.bodyStart) + themeBody + currentCss.slice(curTheme.bodyEnd);
      fontSansResult = { from: fromFont, to: targetFontVar };
    }
  }

  // Wire display-font if requested
  let displayFontResult = null;
  if (displayFont) {
    let curTheme = findTopLevelBlock(currentCss, '@theme inline');
    let themeBody = curTheme.body;

    let targetHeadingVar = 'var(--font-sans)';
    if (displayFont !== 'none') {
      targetHeadingVar = displayFont.startsWith('var(')
        ? displayFont
        : `var(--font-${displayFont})`;
    }

    const headingMatch = themeBody.match(/--font-heading:\s*([^;]+);/);
    const fromHeading = headingMatch ? headingMatch[1].trim() : null;

    if (fromHeading !== targetHeadingVar) {
      if (headingMatch) {
        themeBody = themeBody.replace(
          /--font-heading:\s*[^;]+;/,
          `--font-heading: ${targetHeadingVar};`
        );
      } else {
        themeBody = `${themeBody.replace(/\s*$/, '')}${newline}  --font-heading: ${targetHeadingVar};${newline}`;
      }

      currentCss = currentCss.slice(0, curTheme.bodyStart) + themeBody + currentCss.slice(curTheme.bodyEnd);
      displayFontResult = { from: fromHeading, to: targetHeadingVar };
    }
  }

  const changed = currentCss !== css;

  return {
    css: currentCss,
    changed,
    palette: paletteName,
    accent: accent || 'none',
    radius: radius || 'default',
    displayFont: displayFont || 'none',
    rootScheme: effectiveRootScheme,
    replaced,
    appended,
    skippedCustom,
    kept,
    registered,
    fontSans: fontSansResult,
    displayFontResult,
    warnings,
  };
}

export function updateComponentsJson(projectDir, paletteName, dryRun = false) {
  const compPath = path.join(projectDir, 'components.json');
  if (!fs.existsSync(compPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(compPath, 'utf8');
    const data = JSON.parse(raw);
    const oldBaseColor = data.tailwind?.baseColor || null;

    if (oldBaseColor === paletteName) {
      return { changed: false, from: oldBaseColor, to: paletteName };
    }

    if (!data.tailwind) data.tailwind = {};
    data.tailwind.baseColor = paletteName;

    const newContent = `${JSON.stringify(data, null, 2)}\n`;
    if (!dryRun) {
      fs.writeFileSync(compPath, newContent, 'utf8');
    }

    return { changed: true, from: oldBaseColor, to: paletteName };
  } catch {
    return null;
  }
}

// The version the project was last touched with. doctor and upgrade compare it
// against the installed plugin, so it has to land in .frontend-kit.json.
function readPluginVersion() {
  try {
    const manifestPath = path.join(path.resolve(import.meta.dirname, '..'), '.claude-plugin', 'plugin.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

export function updateFrontendKitMeta(projectDir, metaInput = {}, dryRun = false) {
  const metaPath = path.join(projectDir, '.frontend-kit.json');
  let currentMeta = {};

  if (fs.existsSync(metaPath)) {
    try {
      currentMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      currentMeta = {};
    }
  }

  const palette = typeof metaInput === 'string' ? metaInput : metaInput.palette || currentMeta.palette || 'zinc';
  const accent = (typeof metaInput === 'object' && metaInput.accent) ? metaInput.accent : currentMeta.accent || 'none';
  const radius = (typeof metaInput === 'object' && metaInput.radius) ? metaInput.radius : currentMeta.radius || 'default';
  const displayFont = (typeof metaInput === 'object' && metaInput.displayFont) ? metaInput.displayFont : currentMeta.displayFont || 'none';

  const updatedMeta = {
    ...currentMeta,
    kitVersion: readPluginVersion() || currentMeta.kitVersion || null,
    palette,
    accent,
    radius,
    displayFont,
    updatedAt: new Date().toISOString(),
  };

  // Write when a meaningful field changed, not when the CSS changed: a project
  // that is already on the right palette still needs the new kitVersion after a
  // plugin upgrade. updatedAt alone never triggers a write.
  const meaningful = ['kitVersion', 'palette', 'accent', 'radius', 'displayFont'];
  const changed = meaningful.some((key) => currentMeta[key] !== updatedMeta[key]);

  if (!dryRun && changed) {
    fs.writeFileSync(metaPath, `${JSON.stringify(updatedMeta, null, 2)}\n`, 'utf8');
  }

  return { ...updatedMeta, changed };
}

export function parseArgs(argv) {
  const args = {
    projectDir: '.',
    palette: 'zinc',
    accent: null,
    radius: null,
    displayFont: null,
    css: null,
    keep: [],
    force: false,
    rootScheme: 'auto',
    fontSans: null,
    status: true,
    componentsJson: true,
    dryRun: false,
    json: false,
  };

  const positional = [];

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') {
      args.force = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--no-status') {
      args.status = false;
    } else if (arg === '--no-components-json') {
      args.componentsJson = false;
    } else if (arg === '--palette' && i + 1 < argv.length) {
      args.palette = argv[++i];
    } else if (arg.startsWith('--palette=')) {
      args.palette = arg.slice('--palette='.length);
    } else if (arg === '--accent' && i + 1 < argv.length) {
      args.accent = argv[++i];
    } else if (arg.startsWith('--accent=')) {
      args.accent = arg.slice('--accent='.length);
    } else if (arg === '--radius' && i + 1 < argv.length) {
      args.radius = argv[++i];
    } else if (arg.startsWith('--radius=')) {
      args.radius = arg.slice('--radius='.length);
    } else if (arg === '--display-font' && i + 1 < argv.length) {
      args.displayFont = argv[++i];
    } else if (arg.startsWith('--display-font=')) {
      args.displayFont = arg.slice('--display-font='.length);
    } else if (arg === '--css' && i + 1 < argv.length) {
      args.css = argv[++i];
    } else if (arg.startsWith('--css=')) {
      args.css = arg.slice('--css='.length);
    } else if (arg === '--keep' && i + 1 < argv.length) {
      args.keep = argv[++i].split(',').map((k) => k.trim());
    } else if (arg.startsWith('--keep=')) {
      args.keep = arg.slice('--keep='.length).split(',').map((k) => k.trim());
    } else if (arg === '--root-scheme' && i + 1 < argv.length) {
      args.rootScheme = argv[++i];
    } else if (arg.startsWith('--root-scheme=')) {
      args.rootScheme = arg.slice('--root-scheme='.length);
    } else if (arg === '--font-sans' && i + 1 < argv.length) {
      args.fontSans = argv[++i];
    } else if (arg.startsWith('--font-sans=')) {
      args.fontSans = arg.slice('--font-sans='.length);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    args.projectDir = positional[0];
  }

  return args;
}

export function runCli(argv = process.argv) {
  const args = parseArgs(argv);
  const projectDir = path.resolve(process.cwd(), args.projectDir);

  let cssFilePath = null;
  if (args.css) {
    cssFilePath = path.isAbsolute(args.css) ? args.css : path.join(projectDir, args.css);
  } else {
    // Check components.json tailwind.css
    const compPath = path.join(projectDir, 'components.json');
    if (fs.existsSync(compPath)) {
      try {
        const comp = JSON.parse(fs.readFileSync(compPath, 'utf8'));
        if (comp.tailwind?.css) {
          const cand = path.join(projectDir, comp.tailwind.css);
          if (fs.existsSync(cand)) cssFilePath = cand;
        }
      } catch {
        // ignore
      }
    }

    if (!cssFilePath) {
      const candidates = ['src/app/globals.css', 'app/globals.css'].map((p) => path.join(projectDir, p));
      cssFilePath = candidates.find(fs.existsSync) || null;
    }
  }

  if (!cssFilePath || !fs.existsSync(cssFilePath)) {
    const msg = `globals.css not found under ${projectDir}/src/app or ${projectDir}/app`;
    if (args.json) {
      console.log(JSON.stringify({ error: msg }, null, 2));
    } else {
      console.error(`apply-theme-tokens: ${msg}`);
    }
    process.exit(1);
  }

  let originalCss = '';
  try {
    originalCss = fs.readFileSync(cssFilePath, 'utf8');
  } catch (err) {
    console.error(`apply-theme-tokens: could not read ${cssFilePath}: ${err.message}`);
    process.exit(1);
  }

  let result;
  try {
    result = applyTheme(originalCss, {
      palette: args.palette,
      accent: args.accent,
      radius: args.radius,
      displayFont: args.displayFont,
      force: args.force,
      keep: args.keep,
      rootScheme: args.rootScheme,
      fontSans: args.fontSans,
      status: args.status,
    });
  } catch (err) {
    if (args.json) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error(`apply-theme-tokens: ${err.message}`);
    }
    process.exit(err.code || 1);
  }

  let componentsResult = null;
  if (args.componentsJson) {
    componentsResult = updateComponentsJson(projectDir, args.palette, args.dryRun);
  }

  let metaResult = null;
  if (!args.dryRun) {
    metaResult = updateFrontendKitMeta(
      projectDir,
      {
        palette: args.palette,
        accent: args.accent,
        radius: args.radius,
        displayFont: args.displayFont,
      },
      false
    );
  }

  const writeResult = safeWriteFile(cssFilePath, result.css, {
    dryRun: args.dryRun,
    projectDir,
    backup: true,
  });

  const report = {
    cssPath: path.relative(projectDir, cssFilePath),
    rootScheme: result.rootScheme,
    changed: result.changed,
    replaced: result.replaced,
    appended: result.appended,
    skippedCustom: result.skippedCustom,
    kept: result.kept,
    registered: result.registered,
    fontSans: result.fontSans,
    componentsJson: componentsResult,
    diff: writeResult.diff,
    warnings: result.warnings,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!result.changed) {
    console.log('unchanged');
    return;
  }

  if (args.dryRun) {
    console.log(`[dry-run] Would patch ${cssFilePath} with palette '${args.palette}'`);
    if (result.skippedCustom.length > 0) {
      console.log(`Custom tokens skipped: ${result.skippedCustom.join(', ')}`);
    }
  } else {
    console.log(`apply-theme-tokens: patched ${cssFilePath}`);
  }
}

// Run if directly executed
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv);
}
