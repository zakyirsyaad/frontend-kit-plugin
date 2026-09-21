// Patterns shared by review-scan, inspect-registry-item and adapt-registry-item, so the
// three agree on what counts as a raw color, an icon library or risky code.

export const PALETTE_FAMILIES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
export const COLOR_UTILITIES = 'bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|divide|caret|accent|decoration';
export const ICON_PACKAGES = [
  'lucide-react',
  '@phosphor-icons/react',
  '@heroicons/react',
  '@tabler/icons-react',
  '@radix-ui/react-icons',
  'react-icons',
];
// Tailwind v4 ships these animations; any other animate-* needs a theme variable or keyframes.
export const BUILTIN_ANIMATIONS = new Set(['spin', 'ping', 'pulse', 'bounce', 'none']);

export const UNSAFE_CODE = /dangerouslySetInnerHTML|(?<![\w.])eval\s*\(|new\s+Function\s*\(/g;
export const REMOTE_ASSET = /<(?:script|iframe)\b[^>]*src=["']https?:\/\/([^"'/]+)/g;

export function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

// A file is a Server Component unless it opts out. Only the first non-comment
// statement counts, which is why we look at the head of the file.
export function hasUseClient(content) {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(content);
}

export function classStrings(content) {
  // className="..." / className={`...`} / cn("...", "...") / cva(...) bodies.
  const out = [];
  const attr = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g;
  let m;
  while ((m = attr.exec(content)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    out.push({ value, index: m.index });
  }
  const helper = /\b(?:cn|clsx|cva|twMerge)\s*\(([\s\S]{0,600}?)\)/g;
  while ((m = helper.exec(content)) !== null) {
    out.push({ value: m[1], index: m.index });
  }
  return out;
}

// Module specifiers from import/export ... from statements (multi-line safe).
export function importSpecifiers(content) {
  return [...content.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

// "@tabler/icons-react/dist/x" -> "@tabler/icons-react", "motion/react" -> "motion"
export function packageRoot(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}
