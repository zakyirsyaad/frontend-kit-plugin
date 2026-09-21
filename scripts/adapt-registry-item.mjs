#!/usr/bin/env node
// Adapts an installed third-party registry item (Magic UI, Aceternity, ...) to the kit:
// neutral palette classes -> semantic tokens, raw hex -> CSS variables, reduced-motion
// handling, "use client", Tabler/Radix icons -> Lucide, framer-motion -> motion/react.
// Only patterns with one safe answer are rewritten; everything else is reported.
// Touches the item's files and .frontend-kit.json (registryItems[]) and nothing else.
//
// Usage:
//   node adapt-registry-item.mjs <@registry/item> [project-dir] [--from-file view.json] [--dry-run] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { inspectItem, parseViewOutput, loadCatalog } from './inspect-registry-item.mjs';
import { safeWriteFile, EXIT_CODES } from './lib/fs-safe.mjs';
import { BUILTIN_ANIMATIONS, hasUseClient } from './lib/code-patterns.mjs';
import { hashContents, sourceHashOf } from './lib/registry-state.mjs';

// --- colors -----------------------------------------------------------------

const NEUTRAL = 'neutral|gray|zinc|slate|stone';
const CLASS_RE = new RegExp(
  `^((?:[a-z0-9-]+:)*)(bg|text|border|divide|ring|outline|fill|stroke|from|via|to)-((?:${NEUTRAL})-(\\d{2,3})|black|white)(\\/(?:\\d+|\\[[^\\]]+\\]))?$`,
);
const LEFTOVER_RE = new RegExp(`(?:^|:)(?:bg|text|border|from|via|to|fill|stroke|ring)-(?:${NEUTRAL})-\\d{2,3}`);

// Strength of a neutral in its own mode: 0 = blends with the background, 1000 = full ink.
function strength(color, shade, dark) {
  const lightness = color === 'black' ? 1000 : color === 'white' ? 0 : Number(shade);
  return dark ? 1000 - lightness : lightness;
}

export function mapColorClass(token) {
  const m = token.match(CLASS_RE);
  if (!m) return null;
  const [, variants, utility, colorPart, shade, opacity = ''] = m;
  const color = colorPart.split('-')[0];
  const dark = variants.split(':').includes('dark');
  const s = strength(color, shade, dark);
  const bw = color === 'black' || color === 'white';
  let target = null;
  switch (utility) {
    case 'text':
      target = s >= 700 ? 'foreground' : 'muted-foreground';
      break;
    case 'bg':
      if (bw && opacity && s >= 900) target = 'foreground';
      else if (s <= 50) target = 'background';
      else if (s <= 300) target = 'muted';
      break;
    case 'border':
    case 'divide':
    case 'ring':
    case 'outline':
      if (s <= 400 || (bw && opacity)) target = 'border';
      break;
    case 'fill':
    case 'stroke':
      if (s >= 700) target = 'foreground';
      else if (s >= 300) target = 'muted-foreground';
      break;
    case 'from':
    case 'via':
    case 'to':
      if (bw && s >= 900) target = 'foreground';
      break;
  }
  if (!target) return null;
  // A black or white border tint becomes the border token, which carries its own contrast.
  const keepOpacity = opacity && !(target === 'border' && bw);
  return `${variants}${utility}-${target}${keepOpacity ? opacity : ''}`;
}

// Rewrites one whitespace-separated class list. Returns null when nothing changed.
export function adaptClassList(list, report) {
  let changed = false;
  let mapped = 0;
  const words = list
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const next = mapColorClass(t);
      if (next && next !== t) {
        changed = true;
        mapped++;
        return next;
      }
      if (LEFTOVER_RE.test(t)) report.leftover.push(`Kept ${t}: no single token fits.`);
      return t;
    });
  // Drop dark: twins that now equal their light counterpart (bg-background dark:bg-background).
  const set = new Set(words);
  const deduped = [];
  for (const w of words) {
    const parts = w.split(':');
    if (parts.includes('dark') && set.has(parts.filter((p) => p !== 'dark').join(':'))) {
      changed = true;
      continue;
    }
    if (!deduped.includes(w)) deduped.push(w);
  }
  if (!changed) return null;
  report.count('palette-class', mapped);
  return deduped.join(' ');
}

const STRING_RE = /(["'`])((?:(?!\1)[^\\\n$]|\\.)*?)\1/g;

function adaptClassStrings(content, report) {
  // Double/single-quoted strings and template literals without interpolation.
  return content.replace(STRING_RE, (whole, quote, body) => {
    if (!/\b(?:bg|text|border|divide|ring|outline|fill|stroke|from|via|to)-/.test(body)) return whole;
    const next = adaptClassList(body, report);
    return next === null ? whole : `${quote}${next}${quote}`;
  });
}

// --- hex --------------------------------------------------------------------

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexRole(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (sat > 0.2) return 'chromatic';
  if (l > 0.85) return 'var(--border)';
  if (l < 0.15) return 'var(--foreground)';
  return 'var(--muted-foreground)';
}

function adaptHex(content, report) {
  const chart = new Map();
  return content.replace(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g, (hex) => {
    const role = hexRole(hex);
    if (role !== 'chromatic') {
      report.count('raw-hex', 1);
      return role;
    }
    const key = hex.toLowerCase();
    if (!chart.has(key)) {
      if (chart.size >= 5) {
        report.leftover.push(`Kept ${hex}: more than five accent colors; map it by hand.`);
        return hex;
      }
      chart.set(key, `var(--chart-${chart.size + 1})`);
    }
    report.count('raw-hex', 1);
    return chart.get(key);
  });
}

// --- JS structure helpers ----------------------------------------------------

// Index of the bracket that closes the one at `open`, skipping strings, templates and comments.
function matchBracket(src, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [pairs[src[open]]];
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1;
      if (i === 0) return -1;
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

// Exported function components with a block body: [{ name, bodyStart, bodyEnd }].
// Handles `export function X(...) {`, `export const X = (...) => {` with multi-line
// params, and wrappers such as `React.memo(`, `memo(`, `forwardRef(`.
export function componentBodies(src) {
  const found = [];
  const re = /export\s+(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\b)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    const skipWs = () => {
      while (/\s/.test(src[i] ?? '')) i++;
    };
    if (m[2]) {
      // const X[: Type] = [React.memo(|forwardRef<...>(]* (params) [: Type] => {
      const eq = src.indexOf('=', i);
      if (eq < 0) continue;
      i = eq + 1;
      skipWs();
      for (;;) {
        const wrapper = src.slice(i).match(/^(?:React\.)?(?:memo|forwardRef)\s*(?:<[^>]*>)?\s*\(/);
        if (!wrapper) break;
        i += wrapper[0].length;
        skipWs();
      }
      if (src.startsWith('async', i)) {
        i += 5;
        skipWs();
      }
      if (src.startsWith('function', i)) continue; // `= function (...)`: rare in registries, left for a person
    } else {
      skipWs();
      if (src[i] === '<') i = src.indexOf('>', i) + 1;
      skipWs();
    }
    if (src[i] !== '(') continue;
    const paramsEnd = matchBracket(src, i);
    if (paramsEnd < 0) continue;
    let bodyStart;
    if (m[1]) {
      bodyStart = src.indexOf('{', paramsEnd);
      // A return type like ": React.ReactNode" may sit between params and body.
      if (bodyStart < 0 || /[;=]/.test(src.slice(paramsEnd + 1, bodyStart))) continue;
    } else {
      const arrow = src.indexOf('=>', paramsEnd);
      if (arrow < 0) continue;
      i = arrow + 2;
      skipWs();
      if (src[i] !== '{') continue; // concise arrow body: nothing safe to insert into
      bodyStart = i;
    }
    const bodyEnd = matchBracket(src, bodyStart);
    if (bodyEnd > 0) found.push({ name: m[1] ?? m[2], bodyStart, bodyEnd });
  }
  return found;
}

// Index of the last `return` at the top level of a body.
function lastTopLevelReturn(src, bodyStart, bodyEnd) {
  let depth = 0;
  let last = -1;
  for (let i = bodyStart + 1; i < bodyEnd; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < bodyEnd && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (depth === 0 && src.startsWith('return', i) && !/\w/.test(src[i - 1] ?? '') && !/\w/.test(src[i + 6] ?? '')) last = i;
  }
  return last;
}

// Adds `name` to an existing `import { ... } from "<from>"`; null when there is no such import.
function addNamedImport(src, from, name) {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${from.replace('/', '\\/')}["']`);
  const m = src.match(re);
  if (!m) return null;
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (names.includes(name)) return src;
  return src.replace(re, `import { ${[...names, name].sort().join(', ')} } from "${from}"`);
}

// --- motion -----------------------------------------------------------------

// Follow the file's style: registries differ (Aceternity ends imports with `;`, Magic UI does not).
function usesSemicolons(src) {
  const imports = src.match(/^import\b.*$/gm) ?? [];
  return imports.length > 0 && imports.filter((l) => l.trimEnd().endsWith(';')).length * 2 > imports.length;
}

// Wraps the expression returned at `ret` in `open` ... `close`.
function wrapReturn(out, ret, indent, open, close) {
  const exprStart = ret + 'return'.length;
  const lead = out.slice(exprStart).match(/^\s*/)[0];
  let exprEnd;
  let expr;
  if (out[exprStart + lead.length] === '(') {
    const closeParen = matchBracket(out, exprStart + lead.length);
    expr = out.slice(exprStart + lead.length + 1, closeParen);
    exprEnd = closeParen + 1;
  } else {
    const lineEnd = out.indexOf('\n', exprStart);
    exprEnd = lineEnd < 0 ? out.length : lineEnd;
    expr = out.slice(exprStart, exprEnd).replace(/;\s*$/, '');
  }
  // The wrapped lines keep their indentation so the diff shows only the wrapper; the
  // project's formatter can re-indent later.
  if (lead.length && out[exprStart + lead.length] === '(') {
    const openParen = exprStart + lead.length;
    const closeParen = exprEnd - 1;
    const closeIndent = out.slice(out.lastIndexOf('\n', closeParen) + 1, closeParen);
    return (
      out.slice(0, openParen + 1) +
      `\n${indent}  ${open}` +
      out.slice(openParen + 1, closeParen).replace(/\s+$/, '') +
      `\n${closeIndent || indent}  ${close}\n${closeIndent || indent}` +
      out.slice(closeParen)
    );
  }
  const wrapped = ` (\n${indent}  ${open}\n${indent}  ${expr.trim()}\n${indent}  ${close}\n${indent})`;
  return out.slice(0, exprStart) + wrapped + out.slice(exprEnd);
}

// Reduced motion without changing the server-rendered DOM (so hydration stays clean):
// - ambient backgrounds are pure decoration: a `display: contents` wrapper hides them
//   through the prefers-reduced-motion media query, no JavaScript involved;
// - everything else carries content (a CTA, logos, cards): MotionConfig reducedMotion="user"
//   keeps it on screen and stops transform and layout animations.
function adaptMotion(src, kind, report) {
  const usesMotion = /from\s+["'](?:motion\/react|framer-motion)["']/.test(src);
  if (!usesMotion || /useReducedMotion|MotionConfig|motion-reduce:hidden/.test(src)) return src;

  if (kind === 'content') {
    report.leftover.push('Animates a value: under reduced motion show the final value immediately (useReducedMotion), by hand.');
    return src;
  }

  const bodies = componentBodies(src);
  if (!bodies.length) {
    report.leftover.push('No exported function component with a block body; add reduced-motion handling by hand.');
    return src;
  }

  const hide = kind === 'ambient';
  let out = src;
  let wrapped = 0;
  // Edit from the end so earlier indices stay valid.
  for (const body of [...bodies].reverse()) {
    const ret = lastTopLevelReturn(out, body.bodyStart, body.bodyEnd);
    if (ret < 0) continue;
    const indent = out.slice(out.lastIndexOf('\n', ret) + 1, ret);
    out = hide
      ? wrapReturn(out, ret, indent, '<div className="contents motion-reduce:hidden">', '</div>')
      : wrapReturn(out, ret, indent, '<MotionConfig reducedMotion="user">', '</MotionConfig>');
    wrapped++;
  }
  if (!wrapped) {
    report.leftover.push('No top-level return found; add reduced-motion handling by hand.');
    return src;
  }
  if (hide) {
    report.count('reduced-motion-hide', wrapped);
    return out;
  }
  const withImport = addNamedImport(out, 'motion/react', 'MotionConfig');
  if (withImport === null) {
    report.leftover.push('Could not add MotionConfig to the motion/react import; add it by hand.');
    return src;
  }
  report.count('reduced-motion-config', wrapped);
  report.leftover.push('MotionConfig stops transform and layout animations only; check any other animated property under reduced motion.');
  return withImport;
}

function adaptCssAnimations(src, report) {
  return src.replace(STRING_RE, (whole, quote, body) => {
    const tokens = body.split(/\s+/).filter(Boolean);
    const animations = tokens.filter((t) => {
      const m = t.match(/(?:^|:)animate-([a-z][\w-]*)$/);
      return m && !BUILTIN_ANIMATIONS.has(m[1]) && !t.startsWith('motion-reduce:') && !t.startsWith('motion-safe:');
    });
    if (!animations.length || tokens.includes('motion-reduce:animate-none')) return whole;
    report.count('reduced-motion-css', animations.length);
    return `${quote}${body} motion-reduce:animate-none${quote}`;
  });
}

// --- icons ------------------------------------------------------------------

// Every Lucide name here was checked against lucide-react 1.x (it has no brand icons).
const ICON_MAP = {
  '@tabler/icons-react': {
    IconArrowRight: 'ArrowRightIcon',
    IconArrowUpRight: 'ArrowUpRightIcon',
    IconChevronRight: 'ChevronRightIcon',
    IconChevronDown: 'ChevronDownIcon',
    IconCheck: 'CheckIcon',
    IconX: 'XIcon',
    IconPlus: 'PlusIcon',
    IconMinus: 'MinusIcon',
    IconSearch: 'SearchIcon',
    IconBolt: 'ZapIcon',
    IconStar: 'StarIcon',
    IconHeart: 'HeartIcon',
    IconUser: 'UserIcon',
    IconSettings: 'SettingsIcon',
    IconMail: 'MailIcon',
    IconBell: 'BellIcon',
    IconHome: 'HouseIcon',
    IconLock: 'LockIcon',
    IconCalendar: 'CalendarIcon',
    IconFileText: 'FileTextIcon',
    IconWorld: 'GlobeIcon',
    IconCopy: 'CopyIcon',
    IconClipboard: 'ClipboardIcon',
    IconExternalLink: 'ExternalLinkIcon',
    IconMenu2: 'MenuIcon',
    IconMoon: 'MoonIcon',
    IconSun: 'SunIcon',
    IconSparkles: 'SparklesIcon',
    IconTable: 'TableIcon',
    IconBox: 'BoxIcon',
    IconLayoutGrid: 'LayoutGridIcon',
    IconSignature: 'SignatureIcon',
  },
  '@radix-ui/react-icons': {
    ArrowRightIcon: 'ArrowRightIcon',
    ChevronRightIcon: 'ChevronRightIcon',
    ChevronDownIcon: 'ChevronDownIcon',
    CheckIcon: 'CheckIcon',
    Cross2Icon: 'XIcon',
    PlusIcon: 'PlusIcon',
    MinusIcon: 'MinusIcon',
    MagnifyingGlassIcon: 'SearchIcon',
    StarIcon: 'StarIcon',
    HeartIcon: 'HeartIcon',
    PersonIcon: 'UserIcon',
    GearIcon: 'SettingsIcon',
    EnvelopeClosedIcon: 'MailIcon',
    BellIcon: 'BellIcon',
    HomeIcon: 'HouseIcon',
    LockClosedIcon: 'LockIcon',
    CalendarIcon: 'CalendarIcon',
    FileTextIcon: 'FileTextIcon',
    GlobeIcon: 'GlobeIcon',
    CopyIcon: 'CopyIcon',
    ClipboardIcon: 'ClipboardIcon',
    ExternalLinkIcon: 'ExternalLinkIcon',
    HamburgerMenuIcon: 'MenuIcon',
    MoonIcon: 'MoonIcon',
    SunIcon: 'SunIcon',
    TableIcon: 'TableIcon',
    BoxIcon: 'BoxIcon',
  },
};

function adaptIcons(src, report) {
  let out = src;
  for (const [pkg, map] of Object.entries(ICON_MAP)) {
    const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${pkg.replace('/', '\\/')}["'];?\\n?`);
    const m = out.match(re);
    if (!m) continue;
    const kept = [];
    const moved = [];
    for (const spec of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const [imported, local = imported] = spec.split(/\s+as\s+/);
      if (map[imported]) moved.push({ local, lucide: map[imported] });
      else kept.push(spec);
    }
    if (!moved.length) {
      report.leftover.push(`No Lucide match for ${m[1].trim()} from ${pkg}; kept.`);
      continue;
    }
    out = out.replace(re, kept.length ? `import { ${kept.join(', ')} } from "${pkg}"\n` : '').replace(/^\n+/, '');
    for (const { local, lucide } of moved) {
      if (local !== lucide) out = out.replace(new RegExp(`\\b${local}\\b`, 'g'), lucide);
      if (new RegExp(`<${lucide}\\b[^>]*\\sstroke=\\{`).test(out)) {
        report.leftover.push(`${lucide}: Tabler's stroke={n} is Lucide's strokeWidth; check the props.`);
      }
    }
    const names = [...new Set(moved.map((x) => x.lucide))].sort();
    let merged = out;
    for (const n of names) merged = addNamedImport(merged, 'lucide-react', n) ?? merged;
    if (!/from\s+["']lucide-react["']/.test(merged)) {
      // No lucide import yet: add one after "use client" (if any) and before the first import.
      const at = merged.search(/^import\s/m);
      merged = `${merged.slice(0, at)}import { ${names.join(', ')} } from "lucide-react"\n${merged.slice(at)}`;
    }
    out = merged;
    if (kept.length) report.leftover.push(`Kept ${kept.join(', ')} from ${pkg}: no Lucide match.`);
    report.count('icons-to-lucide', moved.length);
  }
  return out;
}

// --- driver -----------------------------------------------------------------

export function adaptSource(src, { kind = null, needsClient = false } = {}) {
  const counts = new Map();
  const report = {
    leftover: [],
    count(id, n) {
      if (n > 0) counts.set(id, (counts.get(id) ?? 0) + n);
    },
  };
  let out = src;
  if (/from\s+["']framer-motion["']/.test(out)) {
    out = out.replace(/from\s+["']framer-motion["']/g, 'from "motion/react"');
    report.count('framer-motion-import', 1);
  }
  out = adaptClassStrings(out, report);
  out = adaptHex(out, report);
  out = adaptIcons(out, report);
  out = adaptCssAnimations(out, report);
  out = adaptMotion(out, kind, report);
  if (needsClient && !hasUseClient(out)) {
    out = `"use client"${usesSemicolons(out) ? ';' : ''}\n\n${out}`;
    report.count('use-client', 1);
  }
  return { content: out, adaptations: [...counts].map(([id, count]) => ({ id, count })), leftovers: report.leftover };
}

export { sourceHashOf };

export function adaptItem(item, projectDir, options = {}) {
  const resolved = path.resolve(projectDir);
  const itemId = options.itemId ?? item.name;
  const dryRun = Boolean(options.dryRun);
  const inspection = inspectItem(item, { itemId, dirs: options.dirs, catalog: options.catalog ?? loadCatalog() });
  if (inspection.verdict === 'blocked') {
    return { item: itemId, blocked: true, issues: inspection.issues.filter((i) => i.severity === 'block'), files: [] };
  }
  const missing = inspection.files.map((f) => f.destination).filter((d) => !fs.existsSync(path.join(resolved, d)));
  if (missing.length) {
    return { item: itemId, missing, files: [], message: 'Install the item first (shadcn add), then adapt it.' };
  }

  const kind = inspection.catalog?.kind ?? null;
  const files = [];
  const adaptedContents = [];
  for (const f of inspection.files) {
    const full = path.join(resolved, f.destination);
    const result = adaptSource(fs.readFileSync(full, 'utf8'), { kind, needsClient: f.needsClient });
    const write = safeWriteFile(full, result.content, { dryRun, projectDir: resolved, backup: true });
    adaptedContents.push(result.content);
    files.push({ file: f.destination, changed: write.changed, diff: write.diff, adaptations: result.adaptations, leftovers: result.leftovers });
  }

  // Packages the item brought that none of its files import any more: candidates for removal.
  const importsPkg = (pkg) => adaptedContents.some((c) => new RegExp(`from\\s+["']${pkg.replace('/', '\\/')}(?:/[^"']*)?["']`).test(c));
  const removableDependencies = [...new Set([...inspection.dependencies.iconLibraries, ...inspection.dependencies.unused])].filter(
    (pkg) => !importsPkg(pkg),
  );

  const entry = {
    item: itemId,
    registry: inspection.registry,
    files: files.map((f) => f.file),
    sourceHash: sourceHashOf(item),
    adaptedHash: hashContents(adaptedContents),
    adaptations: [...new Set(files.flatMap((f) => f.adaptations.map((a) => a.id)))].sort(),
  };

  const statePath = path.join(resolved, '.frontend-kit.json');
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    state = {};
  }
  const items = Array.isArray(state.registryItems) ? state.registryItems : [];
  const previous = items.find((r) => r.item === itemId);
  const unchanged =
    previous &&
    previous.sourceHash === entry.sourceHash &&
    previous.adaptedHash === entry.adaptedHash &&
    previous.files.join('\n') === entry.files.join('\n');
  let stateWrite = { changed: false, diff: '' };
  const recorded = { ...entry, installedAt: previous?.installedAt ?? new Date().toISOString().slice(0, 10) };
  if (!unchanged) {
    const registryItems = [...items.filter((r) => r.item !== itemId), recorded].sort((a, b) => a.item.localeCompare(b.item));
    stateWrite = safeWriteFile(statePath, `${JSON.stringify({ ...state, registryItems }, null, 2)}\n`, {
      dryRun,
      projectDir: resolved,
      backup: fs.existsSync(statePath),
    });
  }

  return {
    item: itemId,
    kind,
    dryRun,
    files,
    removableDependencies,
    leftovers: files.flatMap((f) => f.leftovers.map((l) => `${f.file}: ${l}`)),
    state: { changed: stateWrite.changed, diff: stateWrite.diff, entry: unchanged ? previous : recorded },
  };
}

function formatResult(res) {
  if (res.blocked) return `${res.item}: blocked\n${res.issues.map((i) => `  ${i.id}: ${i.message}`).join('\n')}`;
  if (res.missing) return `${res.item}: ${res.message}\n  missing: ${res.missing.join(', ')}`;
  const lines = [`${res.item}${res.dryRun ? ' [dry-run]' : ''}`];
  for (const f of res.files) {
    lines.push(`${f.changed ? '~' : '.'} ${f.file}${f.adaptations.length ? ` — ${f.adaptations.map((a) => `${a.id}×${a.count}`).join(', ')}` : ''}`);
    if (res.dryRun && f.diff) lines.push(f.diff);
  }
  for (const l of res.leftovers) lines.push(`left as is: ${l}`);
  if (res.removableDependencies.length) {
    lines.push(`no longer imported by the item (remove only with the user's OK): ${res.removableDependencies.join(', ')}`);
  }
  lines.push(`.frontend-kit.json registryItems: ${res.state.changed ? (res.dryRun ? 'would update' : 'updated') : 'unchanged'}`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const dryRun = args.includes('--dry-run');
  const fromIndex = args.indexOf('--from-file');
  const fromFile = fromIndex >= 0 ? args[fromIndex + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && (fromIndex < 0 || i !== fromIndex + 1));
  const [itemId, projectDir = '.'] = positional;
  if (!itemId || !/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(itemId)) {
    console.error('Usage: node adapt-registry-item.mjs <@registry/item> [project-dir] [--from-file view.json] [--dry-run] [--json]');
    process.exit(EXIT_CODES.FIXABLE);
  }
  try {
    const { detectProject } = await import('./detect-project.mjs');
    const report = detectProject(path.resolve(projectDir), { for: 'doctor' });
    const uiDir = report.shadcn?.uiDir ?? 'components/ui';
    const root = path.posix.dirname(uiDir);
    const dirs = { ui: uiDir, components: root, hooks: root.replace(/components$/, 'hooks'), lib: root.replace(/components$/, 'lib') };
    let raw;
    if (fromFile) {
      raw = fs.readFileSync(fromFile, 'utf8');
    } else {
      const { execFileSync } = await import('node:child_process');
      const [bin, ...rest] = (report.packageManager?.commands?.shadcn ?? 'npx shadcn@4').split(' ');
      raw = execFileSync(bin, [...rest, 'view', itemId], {
        cwd: path.resolve(projectDir),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    }
    const res = adaptItem(parseViewOutput(raw), projectDir, { itemId, dirs, dryRun });
    console.log(json ? JSON.stringify(res, null, 2) : formatResult(res));
    process.exit(res.blocked ? EXIT_CODES.UNSUPPORTED : res.missing ? EXIT_CODES.FIXABLE : EXIT_CODES.OK);
  } catch (error) {
    console.error(`adapt-registry-item: ${error.message}`);
    process.exit(EXIT_CODES.FIXABLE);
  }
}
