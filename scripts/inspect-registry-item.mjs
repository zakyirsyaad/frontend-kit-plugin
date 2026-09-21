#!/usr/bin/env node
// Read-only report on a third-party registry item (Magic UI, Aceternity, ...) before it is
// installed: where its files land, what it adds to package.json and globals.css, raw colors,
// motion without reduced-motion handling, a missing "use client", extra icon libraries,
// animation classes without keyframes, risky code, and the source license.
//
// Usage:
//   node inspect-registry-item.mjs <@registry/item> [project-dir] [--json]
//   node inspect-registry-item.mjs <@registry/item> --from-file view.json [--json]
//
// Without --from-file it runs `shadcn@4 view <item>` with the project's package manager.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PALETTE_FAMILIES,
  COLOR_UTILITIES,
  ICON_PACKAGES,
  BUILTIN_ANIMATIONS,
  UNSAFE_CODE,
  REMOTE_ASSET,
  lineOf,
  hasUseClient,
  importSpecifiers,
  packageRoot,
} from './lib/code-patterns.mjs';
import { EXIT_CODES } from './lib/fs-safe.mjs';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG_PATH = path.join(PLUGIN_ROOT, 'catalog', 'effects.json');

// Packages every kit project already has; importing them is not an undeclared dependency.
const PROVIDED = new Set(['react', 'react-dom', 'next', 'lucide-react', 'cn', 'clsx', 'tailwind-merge', 'class-variance-authority', 'radix-ui']);

export const SEVERITY = { BLOCK: 'block', ADAPT: 'adapt', WARN: 'warn', INFO: 'info' };

function loadColorTokens() {
  const zinc = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'palettes', 'zinc.json'), 'utf8'));
  return new Set([...Object.keys(zinc.light), 'status-live', 'status-warning', 'status-error', 'radius']);
}

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

// `shadcn view` prints an array; accept a bare item too.
export function parseViewOutput(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || !Array.isArray(item.files)) throw new Error('Not a registry item: expected an object with files[].');
  return item;
}

// Where `shadcn add` puts a file, relative to the project root.
export function destinationOf(file, dirs) {
  const base = path.posix.basename(file.target || file.path);
  switch (file.type) {
    case 'registry:hook':
      return `${dirs.hooks}/${base}`;
    case 'registry:lib':
      return `${dirs.lib}/${base}`;
    case 'registry:component':
    case 'registry:block':
      return `${dirs.components}/${base}`;
    default:
      return `${dirs.ui}/${base}`;
  }
}

function scanFile(content) {
  const hex = [...content.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)].map((m) => ({ value: m[0], line: lineOf(content, m.index) }));
  const paletteRe = new RegExp(
    `(?<![\\w-])(?:[a-z-]+:)*(?:${COLOR_UTILITIES})-(?:(?:${PALETTE_FAMILIES})-\\d{2,3}|black|white)(?:\\/(?:\\d+|\\[[^\\]]+\\]))?(?![\\w-])`,
    'g',
  );
  const paletteClasses = [...content.matchAll(paletteRe)].map((m) => ({ value: m[0], line: lineOf(content, m.index) }));
  const imports = importSpecifiers(content);
  const usesMotion = imports.some((s) => s === 'motion/react' || s === 'framer-motion' || s.startsWith('motion/'));
  const usesFramerMotion = imports.includes('framer-motion');
  const usesHooks = /\buse(?:State|Effect|Ref|LayoutEffect|Reducer|Callback|Memo|Context|Transition|InView|MotionValue|Spring|Scroll|Animation|Theme)\s*[<(]/.test(content);
  const usesEvents = /\bon(?:Click|Mouse\w+|Pointer\w+|Key\w+|Focus|Blur|Change|Submit|Scroll)\s*=/.test(content);
  const animations = [...new Set([...content.matchAll(/(?<![\w-])(?:[a-z-]+:)*animate-([a-z][\w-]*)/g)].map((m) => m[1]))];
  const reducedMotion = /useReducedMotion|MotionConfig|prefers-reduced-motion|motion-reduce:|motion-safe:/.test(content);
  return {
    hex,
    paletteClasses,
    imports,
    usesMotion,
    usesFramerMotion,
    needsClient: usesMotion || usesHooks || usesEvents,
    useClient: hasUseClient(content),
    animations,
    reducedMotion,
    unsafe: [...content.matchAll(UNSAFE_CODE)].map((m) => ({ value: m[0], line: lineOf(content, m.index) })),
    remote: [...content.matchAll(REMOTE_ASSET)].map((m) => ({ host: m[1], line: lineOf(content, m.index) })),
  };
}

function parseName(spec) {
  const at = spec.lastIndexOf('@');
  return at > 0 ? spec.slice(0, at) : spec;
}

export function inspectItem(item, options = {}) {
  const catalog = options.catalog ?? loadCatalog();
  const dirs = { ui: 'components/ui', components: 'components', hooks: 'hooks', lib: 'lib', ...(options.dirs ?? {}) };
  const itemId = options.itemId ?? item.name;
  const registry = itemId.startsWith('@') ? itemId.split('/')[0] : null;
  const colorTokens = loadColorTokens();
  const issues = [];
  const add = (id, severity, message, extra = {}) => issues.push({ id, severity, message, ...extra });

  const declared = [...(item.dependencies ?? []), ...(item.devDependencies ?? [])].map(parseName);
  const themeVars = Object.keys(item.cssVars?.theme ?? {});
  const definedAnimations = new Set(themeVars.filter((k) => k.startsWith('animate-')).map((k) => k.slice('animate-'.length)));

  const files = item.files.map((file) => {
    const content = file.content ?? '';
    const scan = scanFile(content);
    const destination = destinationOf(file, dirs);
    for (const u of scan.unsafe) add('unsafe-code', SEVERITY.BLOCK, `${u.value} in the item's code.`, { file: destination, line: u.line });
    for (const r of scan.remote) add('remote-asset', SEVERITY.BLOCK, `Loads a script or iframe from ${r.host}.`, { file: destination, line: r.line });
    if (scan.needsClient && !scan.useClient) {
      add('missing-use-client', SEVERITY.ADAPT, 'Uses motion, hooks or event handlers but has no "use client" directive.', { file: destination, line: 1 });
    }
    const customAnimations = scan.animations.filter((a) => !BUILTIN_ANIMATIONS.has(a));
    if ((scan.usesMotion || customAnimations.length) && !scan.reducedMotion) {
      add('missing-reduced-motion', SEVERITY.ADAPT, 'Animates without any reduced-motion handling.', { file: destination });
    }
    for (const a of customAnimations.filter((a) => !definedAnimations.has(a))) {
      add('missing-animation-css', SEVERITY.ADAPT, `Uses animate-${a} but the item defines no --animate-${a} or @keyframes, so it will not animate under Tailwind v4.`, { file: destination });
    }
    if (scan.hex.length) add('raw-hex', SEVERITY.ADAPT, `${scan.hex.length} raw hex color(s).`, { file: destination, line: scan.hex[0].line });
    if (scan.paletteClasses.length) {
      add('palette-class', SEVERITY.ADAPT, `${scan.paletteClasses.length} palette class(es) instead of tokens.`, { file: destination, line: scan.paletteClasses[0].line });
    }
    if (scan.usesFramerMotion) add('framer-motion-import', SEVERITY.ADAPT, 'Imports framer-motion; the kit uses motion/react.', { file: destination });
    return {
      source: file.path,
      destination,
      type: file.type,
      lines: content ? content.split('\n').length : 0,
      useClient: scan.useClient,
      needsClient: scan.needsClient,
      usesMotion: scan.usesMotion,
      reducedMotion: scan.reducedMotion,
      animations: scan.animations,
      hex: scan.hex,
      paletteClasses: scan.paletteClasses,
      imports: scan.imports,
    };
  });

  const importedPackages = new Set(
    files.flatMap((f) => f.imports).filter((s) => !s.startsWith('.') && !s.startsWith('@/') && !s.startsWith('~/')).map(packageRoot),
  );
  const undeclared = [...importedPackages].filter((p) => !declared.includes(p) && !PROVIDED.has(p));
  const unused = declared.filter((d) => !importedPackages.has(d));
  const iconLibraries = [...new Set([...declared, ...importedPackages])].filter((p) => ICON_PACKAGES.includes(p) && p !== 'lucide-react');

  for (const p of undeclared) add('undeclared-dependency', SEVERITY.ADAPT, `Imports ${p} but does not declare it; install it before or with the item.`);
  for (const p of unused) add('unused-dependency', SEVERITY.INFO, `Declares ${p} but its files never import it; the package is installed anyway.`);
  for (const p of iconLibraries) {
    add('extra-icon-library', importedPackages.has(p) ? SEVERITY.ADAPT : SEVERITY.INFO, `Brings ${p} next to lucide-react.`);
  }

  const lightVars = Object.keys(item.cssVars?.light ?? {});
  const darkVars = Object.keys(item.cssVars?.dark ?? {});
  const overridden = [...new Set([...themeVars, ...lightVars, ...darkVars].filter((k) => colorTokens.has(k) || colorTokens.has(k.replace(/^color-/, ''))))];
  if (overridden.length) {
    add('overrides-color-token', SEVERITY.WARN, `Writes kit tokens into globals.css: ${overridden.join(', ')}. That would change the palette.`);
  }

  const license = registry ? catalog.registries[registry] ?? null : null;
  if (!license) add('unknown-license', SEVERITY.WARN, `No license on record for ${registry ?? 'this item'}; check it before shipping.`);

  const need = catalog.needs.find((n) => n.candidates.some((c) => c.item === itemId));
  const catalogEntry = need
    ? { need: need.id, kind: need.kind, dashboardOk: need.dashboardOk, issues: need.candidates.find((c) => c.item === itemId).issues }
    : null;
  if (catalogEntry?.kind === 'ambient') {
    add('effect-budget', SEVERITY.INFO, 'Ambient background: at most one per page, and none on dashboard routes.');
  } else if (catalogEntry && !catalogEntry.dashboardOk) {
    add('effect-budget', SEVERITY.INFO, 'Decorative effect: keep it off dense dashboard and app routes.');
  }

  const verdict = issues.some((i) => i.severity === SEVERITY.BLOCK)
    ? 'blocked'
    : issues.some((i) => i.severity === SEVERITY.ADAPT || i.severity === SEVERITY.WARN)
      ? 'needs-adaptation'
      : 'ok';

  return {
    item: itemId,
    registry,
    name: item.name,
    type: item.type,
    license,
    catalog: catalogEntry,
    files,
    dependencies: { declared, undeclared, unused, iconLibraries },
    registryDependencies: item.registryDependencies ?? [],
    css: { themeVars, lightVars, darkVars, rules: Object.keys(item.css ?? {}), overridesColorTokens: overridden },
    issues,
    verdict,
  };
}

export function formatReport(report) {
  const lines = [`${report.item} — ${report.verdict}`];
  lines.push(`license: ${report.license ? `${report.license.license} (${report.license.redistribution})` : 'unknown'}`);
  for (const f of report.files) lines.push(`file: ${f.destination} (${f.lines} lines)`);
  if (report.dependencies.declared.length) lines.push(`adds packages: ${report.dependencies.declared.join(', ')}`);
  if (report.registryDependencies.length) lines.push(`adds shadcn components: ${report.registryDependencies.join(', ')}`);
  if (report.css.themeVars.length || report.css.rules.length) {
    lines.push(`globals.css: ${[...report.css.themeVars.map((v) => `--${v}`), ...report.css.rules].join(', ')}`);
  }
  for (const i of report.issues) lines.push(`[${i.severity}] ${i.id}: ${i.message}${i.file ? ` (${i.file}${i.line ? `:${i.line}` : ''})` : ''}`);
  return lines.join('\n');
}

async function viewLive(itemId, projectDir) {
  // Imported lazily so offline use (--from-file) never touches project detection.
  const { detectProject } = await import('./detect-project.mjs');
  const resolved = path.resolve(projectDir);
  const report = detectProject(resolved, { for: 'doctor' });
  const [bin, ...rest] = (report.packageManager?.commands?.shadcn ?? 'npx shadcn@4').split(' ');
  const out = execFileSync(bin, [...rest, 'view', itemId], {
    cwd: resolved,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const uiDir = report.shadcn?.uiDir ?? 'components/ui';
  const root = path.posix.dirname(uiDir);
  return {
    item: parseViewOutput(out),
    dirs: { ui: uiDir, components: root, hooks: root.replace(/components$/, 'hooks'), lib: root.replace(/components$/, 'lib') },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const fromIndex = args.indexOf('--from-file');
  const fromFile = fromIndex >= 0 ? args[fromIndex + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && (fromIndex < 0 || i !== fromIndex + 1));
  const [itemId, projectDir = '.'] = positional;

  if (!itemId || !/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(itemId)) {
    console.error('Usage: node inspect-registry-item.mjs <@registry/item> [project-dir] [--from-file view.json] [--json]');
    process.exit(EXIT_CODES.FIXABLE);
  }

  try {
    const loaded = fromFile
      ? { item: parseViewOutput(fs.readFileSync(fromFile, 'utf8')), dirs: undefined }
      : await viewLive(itemId, projectDir);
    const report = inspectItem(loaded.item, { itemId, dirs: loaded.dirs });
    console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exit(report.verdict === 'blocked' ? EXIT_CODES.UNSUPPORTED : EXIT_CODES.OK);
  } catch (error) {
    console.error(`inspect-registry-item: ${error.message}`);
    process.exit(EXIT_CODES.FIXABLE);
  }
}
