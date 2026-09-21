#!/usr/bin/env node
/**
 * scripts/detect-project.mjs
 * Comprehensive read-only preflight inspector for frontend-kit.
 *
 * Usage:
 *   node detect-project.mjs [project-dir] [--for create|adopt|theme|rules|review|doctor] [--pretty]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findTopLevelBlock } from './lib/css-blocks.mjs';
import { localStatus } from './lib/registry-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PALETTES_DIR = path.join(__dirname, 'palettes');

const VALID_MODES = new Set(['create', 'adopt', 'theme', 'rules', 'review', 'doctor']);

let _palettesCache = null;
function getPalettes() {
  if (_palettesCache) return _palettesCache;
  const palettes = new Map();
  if (fs.existsSync(PALETTES_DIR)) {
    const files = fs.readdirSync(PALETTES_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const name = path.basename(file, '.json');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(PALETTES_DIR, file), 'utf8'));
        palettes.set(name, data);
      } catch {
        // ignore malformed palette files in read-only preflight
      }
    }
  }
  _palettesCache = palettes;
  return palettes;
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// "4.3.1", "^4", "~15.3", ">=19.0.0" -> major. A declared range may be just "^4", so a dot
// cannot be required: projects without node_modules (fresh clones) would read as unknown.
// Non-numeric specs such as "latest" or "workspace:*" stay unknown.
export function parseMajorVersion(versionStr) {
  if (!versionStr) return null;
  const match = String(versionStr).match(/^\s*(?:npm:[^@]+@)?[~^=v<>\s]*(\d+)(?:\.|\s|$|\b)/);
  return match ? parseInt(match[1], 10) : null;
}

function normalizeColorValue(val) {
  if (!val) return '';
  return val.trim().replace(/\s+/g, ' ');
}

function extractCssDeclarations(blockBody) {
  const decls = new Map();
  if (!blockBody) return decls;

  const lines = blockBody.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('/*') || !line.includes(':')) continue;
    const colonIdx = line.indexOf(':');
    const semiIdx = line.lastIndexOf(';');
    const prop = line.slice(0, colonIdx).trim();
    const value = (semiIdx > colonIdx ? line.slice(colonIdx + 1, semiIdx) : line.slice(colonIdx + 1)).trim();
    if (prop.startsWith('--')) {
      decls.set(prop.slice(2), normalizeColorValue(value));
    }
  }
  return decls;
}

function detectColorFormat(decls) {
  let oklchCount = 0;
  let hslCount = 0;
  let hexCount = 0;
  let varCount = 0;

  for (const val of decls.values()) {
    if (val.startsWith('oklch(')) oklchCount++;
    else if (val.startsWith('hsl(') || val.startsWith('hsla(')) hslCount++;
    else if (val.startsWith('#')) hexCount++;
    else if (val.startsWith('var(')) varCount++;
  }

  const total = oklchCount + hslCount + hexCount + varCount;
  if (total === 0) return null;
  if (oklchCount === total) return 'oklch';
  if (hslCount === total) return 'hsl-bare';
  if (hexCount === total) return 'hex';
  if (varCount === total) return 'var';
  return 'mixed';
}

// The identity layer (accent) deliberately replaces these tokens, so they say
// nothing about which base palette a project is on. Counting them made an
// accented zinc project report as `custom`.
const ACCENT_OWNED_TOKENS = new Set([
  'primary',
  'primary-foreground',
  'ring',
  'chart-1',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-ring',
]);

// Compare rule markers against the plugin actually installed, not a literal.
// Hardcoding the version made every project look outdated after a bump.
const PLUGIN_VERSION = (() => {
  try {
    const manifestPath = path.join(path.resolve(import.meta.dirname, '..'), '.claude-plugin', 'plugin.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function pnpmWorkspaceDeclaresPackages(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return /^packages:/m.test(content);
  } catch {
    return false;
  }
}

function matchPaletteAgainstSnapshots(decls, mode = 'light') {
  const palettes = getPalettes();
  if (palettes.size === 0 || decls.size === 0) {
    return { name: null, matchRatio: 0, customTokens: [] };
  }

  let bestPalette = null;
  let bestRatio = -1;
  let bestCustomTokens = [];

  for (const [palName, palData] of palettes.entries()) {
    const targetTokens = palData[mode] || {};
    const targetKeys = Object.keys(targetTokens).filter((k) => !ACCENT_OWNED_TOKENS.has(k));
    if (targetKeys.length === 0) continue;

    let matched = 0;
    const custom = [];

    for (const key of targetKeys) {
      const currentVal = decls.get(key);
      const expectedVal = normalizeColorValue(targetTokens[key]);
      if (currentVal && currentVal === expectedVal) {
        matched++;
      } else if (currentVal) {
        custom.push(key);
      }
    }

    const ratio = matched / targetKeys.length;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestPalette = palName;
      bestCustomTokens = custom;
    }
  }

  if (bestRatio >= 0.8) {
    return {
      name: bestPalette,
      matchRatio: Math.round(bestRatio * 100) / 100,
      customTokens: bestCustomTokens,
    };
  }

  return {
    name: 'custom',
    matchRatio: Math.round(bestRatio * 100) / 100,
    customTokens: Array.from(decls.keys()).filter((k) => !ACCENT_OWNED_TOKENS.has(k)),
  };
}

export function detectProject(targetDir, options = {}) {
  const mode = options.for || 'adopt';
  const resolvedDir = path.resolve(targetDir || '.');

  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Directory not found or inaccessible: ${resolvedDir}`);
  }

  const stops = [];
  const warnings = [];

  // 1. package.json inspection
  const pkgPath = path.join(resolvedDir, 'package.json');
  const pkg = safeReadJson(pkgPath);
  const hasPackageJson = Boolean(pkg);

  if (!hasPackageJson && mode !== 'create') {
    stops.push({
      code: 'NO_PACKAGE_JSON',
      message: 'No package.json found in target directory.',
    });
  }

  const allDeps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };

  // 2. Package Manager & Lockfiles
  const lockfiles = [];
  const lockfileMap = [
    { file: 'bun.lock', name: 'bun' },
    { file: 'bun.lockb', name: 'bun' },
    { file: 'pnpm-lock.yaml', name: 'pnpm' },
    { file: 'yarn.lock', name: 'yarn' },
    { file: 'package-lock.json', name: 'npm' },
    { file: 'npm-shrinkwrap.json', name: 'npm' },
  ];

  const detectedPmNames = new Set();
  for (const item of lockfileMap) {
    if (fs.existsSync(path.join(resolvedDir, item.file))) {
      lockfiles.push(item.file);
      detectedPmNames.add(item.name);
    }
  }

  const declaredPmField = pkg?.packageManager || null;
  let pmName = 'bun'; // default
  let pmSource = 'default';
  let ambiguous = false;

  if (declaredPmField) {
    pmSource = 'packageManager-field';
    if (declaredPmField.startsWith('pnpm')) pmName = 'pnpm';
    else if (declaredPmField.startsWith('yarn')) pmName = 'yarn';
    else if (declaredPmField.startsWith('bun')) pmName = 'bun';
    else if (declaredPmField.startsWith('npm')) pmName = 'npm';
  } else if (detectedPmNames.size === 1) {
    pmName = Array.from(detectedPmNames)[0];
    pmSource = 'lockfile';
  } else if (detectedPmNames.size > 1) {
    ambiguous = true;
    pmSource = 'lockfile';
    warnings.push({
      code: 'MULTIPLE_LOCKFILES',
      message: `Multiple conflicting lockfiles detected: ${lockfiles.join(', ')}.`,
    });
    // Priority tie-breaker: pnpm > bun > yarn > npm
    if (detectedPmNames.has('pnpm')) pmName = 'pnpm';
    else if (detectedPmNames.has('bun')) pmName = 'bun';
    else if (detectedPmNames.has('yarn')) pmName = 'yarn';
    else pmName = 'npm';
  } else {
    // No lockfile found
    if (mode === 'create') {
      pmName = 'bun';
    } else {
      pmName = 'npm';
      if (hasPackageJson) {
        warnings.push({
          code: 'NO_LOCKFILE',
          message: 'No lockfile found. Defaulting to npm.',
        });
      }
    }
  }

  let yarnBerry = null;
  if (pmName === 'yarn') {
    const hasYarnRcYml = fs.existsSync(path.join(resolvedDir, '.yarnrc.yml'));
    const isBerryDeclared = declaredPmField && /^yarn@([2-9]|\d{2,})/.test(declaredPmField);
    yarnBerry = Boolean(hasYarnRcYml || isBerryDeclared);
  }

  // Construct PM commands
  let pmCommands = {
    install: `${pmName} install`,
    add: `${pmName} add`,
    addDev: `${pmName} add -d`,
    run: `${pmName} run`,
    exec: `${pmName}x`,
    shadcn: `${pmName}x shadcn@4`,
    info: `${pmName} info`,
  };

  if (pmName === 'bun') {
    pmCommands.addDev = 'bun add -d';
    pmCommands.exec = 'bunx';
    pmCommands.shadcn = 'bunx --bun shadcn@4';
    pmCommands.info = 'bun info';
  } else if (pmName === 'pnpm') {
    pmCommands.addDev = 'pnpm add -D';
    pmCommands.exec = 'pnpm dlx';
    pmCommands.shadcn = 'pnpm dlx shadcn@4';
    pmCommands.info = 'pnpm view';
  } else if (pmName === 'yarn') {
    if (yarnBerry) {
      pmCommands.addDev = 'yarn add -D';
      pmCommands.exec = 'yarn dlx';
      pmCommands.shadcn = 'yarn dlx shadcn@4';
      pmCommands.info = 'yarn info';
    } else {
      pmCommands.addDev = 'yarn add -D';
      pmCommands.exec = 'npx --yes';
      pmCommands.shadcn = 'npx --yes shadcn@4';
      pmCommands.info = 'yarn info';
    }
  } else {
    // npm
    pmCommands.add = 'npm install';
    pmCommands.addDev = 'npm install -D';
    pmCommands.exec = 'npx';
    pmCommands.shadcn = 'npx shadcn@4';
    pmCommands.info = 'npm view';
  }

  // 3. Monorepo Detection
  const monorepoSignals = [];
  if (pkg?.workspaces) monorepoSignals.push('package.json:workspaces');
  // create-next-app --use-pnpm always writes pnpm-workspace.yaml, but a plain app
  // only uses it for build approvals (`allowBuilds:`). Only a `packages:` list
  // actually declares a workspace.
  if (pnpmWorkspaceDeclaresPackages(path.join(resolvedDir, 'pnpm-workspace.yaml'))) {
    monorepoSignals.push('pnpm-workspace.yaml');
  }
  if (fs.existsSync(path.join(resolvedDir, 'turbo.json'))) monorepoSignals.push('turbo.json');
  if (fs.existsSync(path.join(resolvedDir, 'nx.json'))) monorepoSignals.push('nx.json');
  if (fs.existsSync(path.join(resolvedDir, 'lerna.json'))) monorepoSignals.push('lerna.json');

  const isMonorepo = monorepoSignals.length > 0;
  if (isMonorepo) {
    if (mode === 'adopt') {
      stops.push({
        code: 'MONOREPO',
        message: `Monorepo structure detected (${monorepoSignals.join(', ')}). frontend-kit adopt requires a standalone project for now.`,
      });
    } else {
      warnings.push({
        code: 'MONOREPO',
        message: `Monorepo signals detected: ${monorepoSignals.join(', ')}.`,
      });
    }
  }

  // 4. Framework / Next.js Detection
  const nextDeclared = allDeps['next'] || null;
  const nextInstalledPkg = safeReadJson(path.join(resolvedDir, 'node_modules', 'next', 'package.json'));
  const nextInstalled = nextInstalledPkg?.version || null;
  const nextMajor = parseMajorVersion(nextInstalled) || parseMajorVersion(nextDeclared);

  if (mode === 'adopt') {
    if (!nextDeclared && !nextInstalled) {
      stops.push({
        code: 'NOT_NEXT',
        message: 'Next.js is not declared or installed in package.json.',
      });
    } else if (nextMajor !== null && nextMajor < 15) {
      stops.push({
        code: 'NEXT_TOO_OLD',
        message: `Next.js version ${nextMajor} detected. Frontend-kit requires Next.js >= 15.`,
      });
    }
  }

  // React Detection
  const reactDeclared = allDeps['react'] || null;
  const reactInstalledPkg = safeReadJson(path.join(resolvedDir, 'node_modules', 'react', 'package.json'));
  const reactInstalled = reactInstalledPkg?.version || null;
  const reactMajor = parseMajorVersion(reactInstalled) || parseMajorVersion(reactDeclared);

  // 5. Router & App Directory
  let appDir = null;
  let srcDir = false;
  if (fs.existsSync(path.join(resolvedDir, 'src', 'app'))) {
    appDir = 'src/app';
    srcDir = true;
  } else if (fs.existsSync(path.join(resolvedDir, 'app'))) {
    appDir = 'app';
    srcDir = false;
  }

  let pagesDir = null;
  if (fs.existsSync(path.join(resolvedDir, 'src', 'pages'))) {
    pagesDir = 'src/pages';
  } else if (fs.existsSync(path.join(resolvedDir, 'pages'))) {
    pagesDir = 'pages';
  }

  if (appDir && pagesDir) {
    warnings.push({
      code: 'APP_AND_PAGES',
      message: 'Both App Router and Pages Router directories were found.',
    });
  }

  if (!appDir && pagesDir && mode === 'adopt') {
    stops.push({
      code: 'PAGES_ROUTER_ONLY',
      message: 'Only Pages Router was detected. Frontend-kit requires Next.js App Router.',
    });
  } else if (!appDir && mode === 'adopt') {
    stops.push({
      code: 'NO_APP_DIR',
      message: 'No App Router directory (app/ or src/app/) was found.',
    });
  }

  let layoutPath = null;
  if (appDir) {
    for (const ext of ['tsx', 'jsx', 'js']) {
      const candidate = path.join(appDir, `layout.${ext}`);
      if (fs.existsSync(path.join(resolvedDir, candidate))) {
        layoutPath = candidate;
        break;
      }
    }
  }

  const isTypeScript = fs.existsSync(path.join(resolvedDir, 'tsconfig.json')) ||
    Boolean(allDeps['typescript']) ||
    (layoutPath ? layoutPath.endsWith('.tsx') : false);

  // Route boundaries inspection
  const boundaries = {
    error: false,
    globalError: false,
    loading: false,
    notFound: false,
  };
  if (appDir) {
    for (const ext of ['tsx', 'jsx', 'js']) {
      if (fs.existsSync(path.join(resolvedDir, appDir, `error.${ext}`))) boundaries.error = true;
      if (fs.existsSync(path.join(resolvedDir, appDir, `global-error.${ext}`))) boundaries.globalError = true;
      if (fs.existsSync(path.join(resolvedDir, appDir, `loading.${ext}`))) boundaries.loading = true;
      if (fs.existsSync(path.join(resolvedDir, appDir, `not-found.${ext}`))) boundaries.notFound = true;
    }
  }

  // 6. Tailwind Detection
  const twDeclared = allDeps['tailwindcss'] || null;
  const twInstalledPkg = safeReadJson(path.join(resolvedDir, 'node_modules', 'tailwindcss', 'package.json'));
  const twInstalled = twInstalledPkg?.version || null;
  const twMajor = parseMajorVersion(twInstalled) || parseMajorVersion(twDeclared);

  const v4Signals = [];
  const v3Signals = [];

  if (allDeps['@tailwindcss/postcss']) v4Signals.push('@tailwindcss/postcss');
  if (twMajor === 4) v4Signals.push(`tailwindcss:^${twMajor}`);

  // Check CSS for Tailwind directives / imports
  let globalsCssRelPath = null;
  const candidateCssPaths = [
    appDir ? path.join(appDir, 'globals.css') : null,
    'src/globals.css',
    'src/app/globals.css',
    'app/globals.css',
    'src/styles/globals.css',
    'styles/globals.css',
  ].filter(Boolean);

  for (const cand of candidateCssPaths) {
    if (fs.existsSync(path.join(resolvedDir, cand))) {
      globalsCssRelPath = cand;
      break;
    }
  }

  let cssRaw = null;
  if (globalsCssRelPath) {
    cssRaw = safeReadText(path.join(resolvedDir, globalsCssRelPath));
  }

  if (cssRaw) {
    if (cssRaw.includes('@import "tailwindcss"') || cssRaw.includes("@import 'tailwindcss'")) {
      v4Signals.push('css:@import "tailwindcss"');
    }
    if (/@tailwind\s+(base|components|utilities)/.test(cssRaw)) {
      v3Signals.push('css:@tailwind directives');
    }
  }

  // Check for tailwind.config.*
  for (const ext of ['js', 'cjs', 'mjs', 'ts']) {
    if (fs.existsSync(path.join(resolvedDir, `tailwind.config.${ext}`))) {
      v3Signals.push(`tailwind.config.${ext}`);
      break;
    }
  }

  // Postcss config inspection
  for (const ext of ['js', 'cjs', 'mjs', 'json']) {
    const pcPath = path.join(resolvedDir, `postcss.config.${ext}`);
    if (fs.existsSync(pcPath)) {
      const content = safeReadText(pcPath) || '';
      if (content.includes('tailwindcss') && !content.includes('@tailwindcss/postcss')) {
        v3Signals.push('postcss:tailwindcss (v3 plugin)');
      }
    }
  }

  if (twMajor === 3) {
    v3Signals.push('tailwindcss:v3 declared/installed');
  }

  const isTailwindConsistent = (v4Signals.length > 0 && v3Signals.length === 0) ||
    (v3Signals.length > 0 && v4Signals.length === 0) ||
    (v4Signals.length === 0 && v3Signals.length === 0);

  if (mode === 'adopt' || mode === 'theme') {
    if (v4Signals.length === 0 && v3Signals.length === 0 && !twDeclared) {
      stops.push({
        code: 'TAILWIND_MISSING',
        message: 'Tailwind CSS was not detected in dependencies or configuration.',
      });
    } else if (v3Signals.length > 0 && v4Signals.length === 0) {
      stops.push({
        code: 'TAILWIND_V3',
        message: 'Tailwind CSS v3 detected. Upgrade to Tailwind v4 first (npx @tailwindcss/upgrade) and commit before adopting frontend-kit.',
      });
    } else if (!isTailwindConsistent) {
      stops.push({
        code: 'TAILWIND_INCONSISTENT',
        message: `Inconsistent Tailwind configuration detected: v4 signals (${v4Signals.join(', ')}) mixed with v3 signals (${v3Signals.join(', ')}).`,
      });
    }
  }

  // 7. shadcn Detection
  const componentsJsonPath = path.join(resolvedDir, 'components.json');
  const componentsJson = safeReadJson(componentsJsonPath);
  const hasComponentsJson = Boolean(componentsJson);

  let shadcnStyle = null;
  let shadcnBase = null;
  let shadcnBaseColor = null;
  let shadcnCssVariables = null;
  let shadcnCssPath = globalsCssRelPath;
  let shadcnAliases = {};
  let uiDir = null;
  let installedComponents = [];
  let utilsPath = null;
  let utilsExports = [];

  if (hasComponentsJson) {
    shadcnStyle = componentsJson.style || null;
    shadcnBaseColor = componentsJson.tailwind?.baseColor || null;
    shadcnCssVariables = componentsJson.tailwind?.cssVariables ?? null;

    if (componentsJson.tailwind?.css) {
      shadcnCssPath = componentsJson.tailwind.css;
    }

    shadcnAliases = componentsJson.aliases || {};

    if (shadcnStyle) {
      if (shadcnStyle.startsWith('radix-')) shadcnBase = 'radix';
      else if (shadcnStyle.startsWith('base-')) shadcnBase = 'base';
      else if (shadcnStyle.startsWith('aria-')) shadcnBase = 'aria';
      else shadcnBase = 'legacy';
    }

    if (shadcnBase === 'legacy' || (shadcnStyle && (shadcnStyle === 'new-york' || shadcnStyle === 'default'))) {
      warnings.push({
        code: 'LEGACY_STYLE',
        message: `Legacy shadcn style detected: "${shadcnStyle}".`,
      });
    }

    // Resolve uiDir
    const uiAlias = shadcnAliases.ui || '@/components/ui';
    const candidateUiDirs = [
      uiAlias.replace(/^@\//, srcDir ? 'src/' : ''),
      uiAlias.replace(/^@\//, ''),
      srcDir ? 'src/components/ui' : 'components/ui',
    ];

    for (const cand of candidateUiDirs) {
      if (fs.existsSync(path.join(resolvedDir, cand))) {
        uiDir = cand;
        break;
      }
    }

    if (uiDir && fs.existsSync(path.join(resolvedDir, uiDir))) {
      try {
        const files = fs.readdirSync(path.join(resolvedDir, uiDir));
        for (const f of files) {
          if (f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.js')) {
            installedComponents.push(path.basename(f, path.extname(f)));
          }
        }
      } catch {
        // ignore read error
      }
    }

    // Resolve utilsPath
    const utilsAlias = shadcnAliases.utils || '@/lib/utils';
    const candidateUtilsPaths = [
      utilsAlias.replace(/^@\//, srcDir ? 'src/' : '') + '.ts',
      utilsAlias.replace(/^@\//, srcDir ? 'src/' : '') + '.js',
      utilsAlias.replace(/^@\//, '') + '.ts',
      srcDir ? 'src/lib/utils.ts' : 'lib/utils.ts',
    ];

    for (const cand of candidateUtilsPaths) {
      if (fs.existsSync(path.join(resolvedDir, cand))) {
        utilsPath = cand;
        break;
      }
    }

    if (utilsPath) {
      const utilsContent = safeReadText(path.join(resolvedDir, utilsPath)) || '';
      const exportMatches = utilsContent.matchAll(/export\s+(?:function|const)\s+([a-zA-Z0-9_$]+)/g);
      for (const m of exportMatches) {
        utilsExports.push(m[1]);
      }
    }
  }

  if (mode === 'theme' && !hasComponentsJson) {
    stops.push({
      code: 'SHADCN_MISSING',
      message: 'components.json not found. Theme skill operates only on shadcn projects.',
    });
  }

  // 8. CSS Detailed Inspection
  let cssResult = {
    path: globalsCssRelPath,
    found: Boolean(cssRaw),
    lineEndings: null,
    tailwindImport: false,
    tailwindV3Directives: false,
    themeInline: false,
    rootBlock: false,
    darkBlock: false,
    customVariantDark: null,
    prefersColorSchemeMedia: false,
    hslWrappedTheme: false,
    colorFormat: null,
    rootScheme: 'light',
    palette: {
      root: null,
      dark: null,
      rootMatch: 0,
      darkMatch: 0,
      customTokens: [],
    },
    statusTokens: {
      declared: [],
      registered: [],
    },
    fontSans: null,
    fontSansSelfReferential: false,
    fontMono: null,
    shape: 'unknown',
  };

  if (cssRaw) {
    cssResult.lineEndings = cssRaw.includes('\r\n') ? 'crlf' : 'lf';
    cssResult.tailwindImport = cssRaw.includes('@import "tailwindcss"') || cssRaw.includes("@import 'tailwindcss'");
    cssResult.tailwindV3Directives = /@tailwind\s+(base|components|utilities)/.test(cssRaw);
    cssResult.prefersColorSchemeMedia = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/.test(cssRaw);

    const rootBlock = findTopLevelBlock(cssRaw, ':root');
    const darkBlock = findTopLevelBlock(cssRaw, '.dark');
    const themeInlineBlock = findTopLevelBlock(cssRaw, '@theme inline');

    cssResult.rootBlock = Boolean(rootBlock);
    cssResult.darkBlock = Boolean(darkBlock);
    cssResult.themeInline = Boolean(themeInlineBlock);

    const customVariantMatch = cssRaw.match(/@custom-variant\s+dark\s+([^;]+);/);
    if (customVariantMatch) {
      cssResult.customVariantDark = customVariantMatch[1].trim();
    }

    if (cssRaw.includes('hsl(var(') || cssRaw.includes('hsla(var(')) {
      cssResult.hslWrappedTheme = true;
    }

    if (themeInlineBlock) {
      if (themeInlineBlock.body.includes('--font-sans: var(--font-sans)')) {
        cssResult.fontSansSelfReferential = true;
        cssResult.fontSans = 'var(--font-sans)';
      } else {
        const fontSansMatch = themeInlineBlock.body.match(/--font-sans:\s*([^;]+);/);
        if (fontSansMatch) cssResult.fontSans = fontSansMatch[1].trim();
      }

      const fontMonoMatch = themeInlineBlock.body.match(/--font-mono:\s*([^;]+);/);
      if (fontMonoMatch) cssResult.fontMono = fontMonoMatch[1].trim();

      for (const st of ['status-live', 'status-warning', 'status-error']) {
        if (themeInlineBlock.body.includes(`--color-${st}:`)) {
          cssResult.statusTokens.registered.push(`--color-${st}`);
        }
      }
    }

    const rootDecls = rootBlock ? extractCssDeclarations(rootBlock.body) : new Map();
    const darkDecls = darkBlock ? extractCssDeclarations(darkBlock.body) : new Map();

    cssResult.colorFormat = detectColorFormat(rootDecls) || detectColorFormat(darkDecls);

    // rootScheme calculation
    const rootBg = rootDecls.get('background');
    if (rootBg) {
      const oklchMatch = rootBg.match(/oklch\(\s*([\d.]+)/);
      if (oklchMatch) {
        const lightness = parseFloat(oklchMatch[1]);
        cssResult.rootScheme = lightness < 0.4 ? 'dark' : 'light';
      }
    }

    // Palette matching
    const rootPal = matchPaletteAgainstSnapshots(rootDecls, cssResult.rootScheme === 'dark' ? 'dark' : 'light');
    const darkPal = darkBlock ? matchPaletteAgainstSnapshots(darkDecls, 'dark') : { name: null, matchRatio: 0, customTokens: [] };

    cssResult.palette.root = rootPal.name;
    cssResult.palette.rootMatch = rootPal.matchRatio;
    cssResult.palette.dark = darkPal.name;
    cssResult.palette.darkMatch = darkPal.matchRatio;
    cssResult.palette.customTokens = Array.from(new Set([...rootPal.customTokens, ...darkPal.customTokens]));

    // Status tokens
    for (const st of ['status-live', 'status-warning', 'status-error']) {
      if (rootDecls.has(st) || darkDecls.has(st)) {
        cssResult.statusTokens.declared.push(st);
      }
    }

    // Shape classification
    if (cssResult.tailwindImport && cssResult.themeInline && cssResult.rootBlock && cssResult.darkBlock) {
      cssResult.shape = 'shadcn-v4';
    } else if (cssResult.tailwindImport && cssResult.themeInline && cssResult.rootBlock && !cssResult.darkBlock) {
      cssResult.shape = 'shadcn-v4-no-dark';
    } else if (cssResult.tailwindImport && cssResult.themeInline) {
      cssResult.shape = 'tailwind-v4-plain';
    } else if (cssResult.tailwindV3Directives) {
      cssResult.shape = 'tailwind-v3';
    } else {
      cssResult.shape = 'unknown';
    }
  }

  if (mode === 'adopt' || mode === 'theme') {
    if (!cssResult.found) {
      stops.push({
        code: 'GLOBALS_CSS_NOT_FOUND',
        message: 'globals.css was not found in expected App Router locations.',
      });
    } else if (!cssResult.rootBlock) {
      stops.push({
        code: 'NO_ROOT_BLOCK',
        message: 'globals.css has no top-level :root block.',
      });
    } else if (cssResult.hslWrappedTheme) {
      stops.push({
        code: 'CSS_HSL_WRAPPED',
        message: 'globals.css uses legacy HSL-wrapped color variables which are not supported by Tailwind v4 OKLCH token engine.',
      });
    }
  }

  // 9. Layout.tsx Inspection
  let layoutResult = {
    path: layoutPath,
    fonts: [],
    googleGeist: false,
    geistPackage: false,
    otherFonts: [],
    htmlClassName: { kind: 'none', hasDark: false },
    suppressHydrationWarning: false,
  };

  if (layoutPath) {
    const layoutContent = safeReadText(path.join(resolvedDir, layoutPath)) || '';

    // Check font imports
    const googleFontMatches = layoutContent.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/g);
    for (const gm of googleFontMatches) {
      const importedNames = gm[1].split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of importedNames) {
        layoutResult.fonts.push({
          source: 'next/font/google',
          import: name,
          binding: name,
          variable: `--font-${name.toLowerCase()}`,
        });
        if (name.toLowerCase().includes('geist')) {
          layoutResult.googleGeist = true;
        } else {
          layoutResult.otherFonts.push(name);
        }
      }
    }

    if (allDeps['geist'] || layoutContent.includes("from 'geist/font/sans'") || layoutContent.includes('from "geist/font/sans"')) {
      layoutResult.geistPackage = true;
    }

    if (layoutContent.includes('suppressHydrationWarning')) {
      layoutResult.suppressHydrationWarning = true;
    }

    const htmlTagMatch = layoutContent.match(/<html[^>]*className=(?:["']([^"']*)["']|\{`([^`]*)`\}|\{([^}]+)\})/);
    if (htmlTagMatch) {
      const rawClass = htmlTagMatch[1] || htmlTagMatch[2] || htmlTagMatch[3] || '';
      const hasDark = rawClass.includes('dark');
      let kind = 'string';
      if (htmlTagMatch[2] !== undefined) kind = 'template';
      else if (htmlTagMatch[3] !== undefined) kind = 'expression';

      layoutResult.htmlClassName = { kind, hasDark };
    }
  }

  // 10. Dark Mode
  let darkModeResult = {
    mode: 'none',
    nextThemes: null,
    themeProvider: null,
    toggleCandidates: [],
  };

  if (allDeps['next-themes']) {
    darkModeResult.mode = 'next-themes';
    darkModeResult.nextThemes = {
      file: layoutPath || 'layout.tsx',
    };
  } else if (layoutResult.htmlClassName.hasDark || cssResult.rootScheme === 'dark') {
    darkModeResult.mode = 'static-dark';
  }

  // 11. Git Status Inspection
  let gitResult = {
    isRepo: false,
    root: null,
    branch: null,
    clean: true,
    dirty: [],
  };

  try {
    const isGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: resolvedDir,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim() === 'true';

    if (isGit) {
      gitResult.isRepo = true;
      gitResult.root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: resolvedDir,
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();

      try {
        gitResult.branch = execFileSync('git', ['branch', '--show-current'], {
          cwd: resolvedDir,
          stdio: ['pipe', 'pipe', 'ignore'],
          encoding: 'utf8',
        }).trim() || 'HEAD';
      } catch {
        gitResult.branch = 'HEAD';
      }

      const statusOut = execFileSync('git', ['status', '--porcelain=v1'], {
        cwd: resolvedDir,
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();

      if (statusOut) {
        gitResult.clean = false;
        gitResult.dirty = statusOut.split('\n').filter(Boolean);
      }
    }
  } catch {
    gitResult.isRepo = false;
    gitResult.clean = true;
  }

  if (mode === 'adopt' && !gitResult.clean) {
    warnings.push({
      code: 'DIRTY_TREE',
      message: 'Git working tree is dirty. We recommend committing changes before adopting frontend-kit.',
    });
  }

  // 12. Agent Documentation (AGENTS.md / CLAUDE.md)
  const agentsMdPath = path.join(resolvedDir, 'AGENTS.md');
  const claudeMdPath = path.join(resolvedDir, 'CLAUDE.md');
  const hasAgentsMd = fs.existsSync(agentsMdPath);
  const hasClaudeMd = fs.existsSync(claudeMdPath);

  let claudeImportsAgents = false;
  if (hasClaudeMd) {
    const claudeContent = safeReadText(claudeMdPath) || '';
    if (claudeContent.includes('@AGENTS.md')) {
      claudeImportsAgents = true;
    }
  }

  const rulesTarget = hasAgentsMd || claudeImportsAgents ? 'AGENTS.md' : (hasClaudeMd ? 'CLAUDE.md' : 'AGENTS.md');
  const targetDocContent = safeReadText(path.join(resolvedDir, rulesTarget)) || '';

  const kitSections = {
    core: 'absent',
    gsap: 'absent',
    '3d': 'absent',
  };

  if (targetDocContent.includes('<!-- frontend-kit:core')) {
    kitSections.core = targetDocContent.includes(`v${PLUGIN_VERSION}`) ? 'current' : 'outdated';
  } else if (targetDocContent.includes('# Frontend Rules') || targetDocContent.includes('# Frontend Systems Engineering Rules') || targetDocContent.includes('d621e65')) {
    kitSections.core = 'legacy';
  }

  if (targetDocContent.includes('<!-- frontend-kit:gsap')) {
    kitSections.gsap = targetDocContent.includes(`v${PLUGIN_VERSION}`) ? 'current' : 'outdated';
  }

  if (targetDocContent.includes('<!-- frontend-kit:3d')) {
    kitSections['3d'] = targetDocContent.includes(`v${PLUGIN_VERSION}`) ? 'current' : 'outdated';
  }

  const agentDocs = {
    agentsMd: hasAgentsMd,
    claudeMd: hasClaudeMd,
    claudeImportsAgents,
    rulesTarget,
    kitSections,
  };

  // 13. kitState from .frontend-kit.json
  const kitJsonPath = path.join(resolvedDir, '.frontend-kit.json');
  const kitState = safeReadJson(kitJsonPath);

  // 14. createChecks (when --for create)
  const createChecks = {
    next: Boolean(hasPackageJson && nextDeclared && appDir),
    shadcn: Boolean(hasComponentsJson && shadcnBase === 'radix'),
    components: installedComponents,
    packages: Boolean(allDeps['motion'] || allDeps['geist']),
    theme: Boolean(cssResult.statusTokens.registered.length >= 3),
    // Phase 4 is only done when BOTH halves landed: self-hosted geist AND the
    // dark class. A fresh create-next-app layout has Google Geist and no dark
    // class, and must not be treated as finished on resume.
    layout: Boolean(layoutPath && layoutResult.geistPackage && layoutResult.htmlClassName.hasDark),
    templates3d: fs.existsSync(path.join(resolvedDir, 'src', 'components', 'systems', 'systems-3d-canvas.tsx')) ||
      fs.existsSync(path.join(resolvedDir, 'components', 'systems', 'systems-3d-canvas.tsx')) ||
      fs.existsSync(path.join(resolvedDir, 'src', 'components', 'systems-3d-canvas.tsx')) ||
      fs.existsSync(path.join(resolvedDir, 'components', 'systems-3d-canvas.tsx')),
    rules: kitSections.core !== 'absent',
  };

  // 15. Doctor Report construction
  const doctorReport = {
    kitVersionInProject: kitState?.kitVersion || null,
    pluginVersion: PLUGIN_VERSION,
    palette: cssResult.palette.root,
    customTokensCount: cssResult.palette.customTokens.length,
    statusTokens: {
      declared: cssResult.statusTokens.declared,
      registered: cssResult.statusTokens.registered,
    },
    rulesMarker: kitSections.core,
    shadcnStyle,
    shadcnBase,
    colorFormat: cssResult.colorFormat,
    fonts: {
      googleGeist: layoutResult.googleGeist,
      geistPackage: layoutResult.geistPackage,
      otherFonts: layoutResult.otherFonts,
    },
    missingBoundaries: Object.entries(boundaries)
      .filter(([_, exists]) => !exists)
      .map(([name]) => `${name}.tsx`),
    multipleLockfiles: ambiguous ? lockfiles : [],
    // Magic UI / Aceternity items installed and adapted by /frontend-kit:effects.
    registryItems: (Array.isArray(kitState?.registryItems) ? kitState.registryItems : []).map((entry) => ({
      item: entry.item,
      installedAt: entry.installedAt ?? null,
      files: entry.files ?? [],
      ...localStatus(resolvedDir, entry),
    })),
    suggestedCommands: [],
  };

  if (!kitState) {
    doctorReport.suggestedCommands.push('/frontend-kit:adopt');
  } else {
    if (cssResult.statusTokens.registered.length < 3) {
      doctorReport.suggestedCommands.push('/frontend-kit:theme');
    }
    if (kitSections.core === 'absent' || kitSections.core === 'legacy' || kitSections.core === 'outdated') {
      doctorReport.suggestedCommands.push('/frontend-kit:rules');
    }
    if (doctorReport.registryItems.some((r) => r.status === 'missing')) {
      doctorReport.suggestedCommands.push('/frontend-kit:effects');
    }
  }

  return {
    schemaVersion: 1,
    kitVersion: PLUGIN_VERSION,
    for: mode,
    projectDir: resolvedDir,
    packageJson: hasPackageJson,
    packageManager: {
      name: pmName,
      source: pmSource,
      lockfiles,
      ambiguous,
      yarnBerry,
      commands: pmCommands,
    },
    monorepo: {
      detected: isMonorepo,
      root: isMonorepo ? resolvedDir : null,
      signals: monorepoSignals,
    },
    next: {
      declared: nextDeclared,
      installed: nextInstalled,
      major: nextMajor,
    },
    react: {
      declared: reactDeclared,
      installed: reactInstalled,
      major: reactMajor,
    },
    tailwind: {
      declared: twDeclared,
      installed: twInstalled,
      major: twMajor,
      v4Signals,
      v3Signals,
      consistent: isTailwindConsistent,
    },
    router: {
      appDir,
      pagesDir,
      srcDir,
      layoutPath,
      typescript: isTypeScript,
      boundaries,
    },
    shadcn: {
      componentsJson: hasComponentsJson,
      style: shadcnStyle,
      base: shadcnBase,
      baseColor: shadcnBaseColor,
      cssVariables: shadcnCssVariables,
      cssPath: shadcnCssPath,
      aliases: shadcnAliases,
      uiDir,
      installedComponents,
      utilsPath,
      utilsExports,
    },
    css: cssResult,
    layout: layoutResult,
    darkMode: darkModeResult,
    deps: {
      motion: allDeps['motion'] || null,
      'framer-motion': allDeps['framer-motion'] || null,
      gsap: allDeps['gsap'] || null,
      '@gsap/react': allDeps['@gsap/react'] || null,
      three: allDeps['three'] || null,
      '@react-three/fiber': allDeps['@react-three/fiber'] || null,
      '@react-three/drei': allDeps['@react-three/drei'] || null,
      geist: allDeps['geist'] || null,
      'next-themes': allDeps['next-themes'] || null,
      typescript: allDeps['typescript'] || null,
    },
    scripts: pkg?.scripts || {},
    git: gitResult,
    agentDocs,
    kitState,
    createChecks: mode === 'create' ? createChecks : undefined,
    doctorReport: mode === 'doctor' ? doctorReport : undefined,
    stops,
    warnings,
  };
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  let targetDir = '.';
  let forMode = 'adopt';
  let pretty = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pretty') {
      pretty = true;
    } else if (arg === '--for') {
      if (i + 1 < args.length) {
        forMode = args[++i];
      }
    } else if (arg.startsWith('--for=')) {
      forMode = arg.slice(6);
    } else if (!arg.startsWith('-')) {
      targetDir = arg;
    }
  }

  if (!VALID_MODES.has(forMode)) {
    process.stderr.write(`Invalid --for mode '${forMode}'. Available modes: ${Array.from(VALID_MODES).join(', ')}\n`);
    process.exit(2);
  }

  try {
    const result = detectProject(targetDir, { for: forMode });
    const output = pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(output + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`detect-project error: ${err.message}\n`);
    process.exit(2);
  }
}
