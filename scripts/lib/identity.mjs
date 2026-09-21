/**
 * scripts/lib/identity.mjs
 * Identity layer: accent colors, radius scales, and display fonts.
 */

export const ACCENT_PRESETS = Object.freeze({
  blue: {
    label: 'Blue',
    light: 'oklch(0.546 0.245 262.881)', // blue-600
    dark: 'oklch(0.623 0.214 259.815)',  // blue-500
    hexLight: '#2563eb',
    hexDark: '#3b82f6',
  },
  emerald: {
    label: 'Emerald',
    light: 'oklch(0.596 0.145 163.225)', // emerald-600
    dark: 'oklch(0.696 0.17 162.48)',    // emerald-500
    hexLight: '#059669',
    hexDark: '#10b981',
  },
  orange: {
    label: 'Orange',
    light: 'oklch(0.609 0.205 40.6)',    // orange-600
    dark: 'oklch(0.704 0.191 47.604)',   // orange-500
    hexLight: '#ea580c',
    hexDark: '#f97316',
  },
  rose: {
    label: 'Rose',
    light: 'oklch(0.573 0.225 15.6)',     // rose-600
    dark: 'oklch(0.645 0.246 16.439)',   // rose-500
    hexLight: '#e11d48',
    hexDark: '#f43f5e',
  },
  amber: {
    label: 'Amber',
    light: 'oklch(0.666 0.179 58.318)',  // amber-600
    dark: 'oklch(0.769 0.188 70.08)',    // amber-500
    hexLight: '#d97706',
    hexDark: '#f59e0b',
  },
  teal: {
    label: 'Teal',
    light: 'oklch(0.6 0.118 184.704)',    // teal-600
    dark: 'oklch(0.704 0.14 182.503)',   // teal-500
    hexLight: '#0d9488',
    hexDark: '#14b8a6',
  },
  violet: {
    label: 'Violet',
    light: 'oklch(0.536 0.252 284.743)', // violet-600
    dark: 'oklch(0.606 0.25 292.717)',   // violet-500
    hexLight: '#7c3aed',
    hexDark: '#8b5cf6',
  },
  indigo: {
    label: 'Indigo',
    light: 'oklch(0.511 0.262 276.966)', // indigo-600
    dark: 'oklch(0.68 0.158 276.935)',   // indigo-400
    hexLight: '#4f46e5',
    hexDark: '#818cf8',
  },
});

export const RADIUS_PRESETS = Object.freeze({
  sharp: '0.25rem',
  default: '0.625rem',
  soft: '1rem',
  pill: '0.625rem', // with --radius-control: 9999px
});

// sRGB Gamma expansion
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Linear RGB to relative luminance
export function relativeLuminance(r, g, b) {
  const rLin = srgbToLinear(r / 255);
  const gLin = srgbToLinear(g / 255);
  const bLin = srgbToLinear(b / 255);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function parseHex(hexStr) {
  let hex = hexStr.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: #${hexStr}`);
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function contrastRatio(lum1, lum2) {
  const l1 = Math.max(lum1, lum2);
  const l2 = Math.min(lum1, lum2);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Convert sRGB to OKLCH
export function rgbToOklch(r, g, b) {
  const rLin = srgbToLinear(r / 255);
  const gLin = srgbToLinear(g / 255);
  const bLin = srgbToLinear(b / 255);

  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + b_ * b_);
  let h = (Math.atan2(b_, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  const LRound = Math.round(L * 1000) / 1000;
  const CRound = Math.round(C * 1000) / 1000;
  const HRound = Math.round(h * 1000) / 1000;

  return `oklch(${LRound} ${CRound} ${HRound})`;
}

export function hexToOklch(hexStr) {
  const { r, g, b } = parseHex(hexStr);
  return rgbToOklch(r, g, b);
}

const WHITE_LUM = relativeLuminance(255, 255, 255);
const ZINC_950_LUM = relativeLuminance(9, 9, 11);

export function resolveForeground(r, g, b) {
  const bgLum = relativeLuminance(r, g, b);
  const contrastWhite = contrastRatio(bgLum, WHITE_LUM);
  const contrastDark = contrastRatio(bgLum, ZINC_950_LUM);

  const bestContrast = Math.max(contrastWhite, contrastDark);
  if (bestContrast < 4.5) {
    throw new Error(
      `Insufficient contrast for color: ratio with white is ${contrastWhite.toFixed(2)}:1, with dark is ${contrastDark.toFixed(2)}:1 (minimum 4.5:1 required by WCAG AA)`
    );
  }

  if (contrastWhite >= contrastDark) {
    return {
      foreground: 'oklch(0.985 0 0)',
      contrast: contrastWhite,
    };
  }

  return {
    foreground: 'oklch(0.141 0.005 285.823)',
    contrast: contrastDark,
  };
}

export function getAccentTokens(accentInput) {
  if (!accentInput || accentInput === 'none') {
    return null;
  }

  let lightVal = null;
  let darkVal = null;
  let lightRgb = null;
  let darkRgb = null;
  let warning = null;

  if (accentInput in ACCENT_PRESETS) {
    const preset = ACCENT_PRESETS[accentInput];
    lightVal = preset.light;
    darkVal = preset.dark;
    lightRgb = parseHex(preset.hexLight);
    darkRgb = parseHex(preset.hexDark);

    if (accentInput === 'violet' || accentInput === 'indigo') {
      warning = `Accent '${accentInput}' is common in generic AI templates; consider emerald, teal, orange, or rose for distinct brand identity.`;
    }
  } else if (accentInput.startsWith('#')) {
    lightRgb = parseHex(accentInput);
    lightVal = hexToOklch(accentInput);
    darkRgb = lightRgb;
    darkVal = lightVal;
  } else {
    const available = Object.keys(ACCENT_PRESETS).join(', ');
    throw new Error(
      `Unknown accent '${accentInput}'. Available presets: ${available}, or provide a hex code (e.g. #2563eb).`
    );
  }

  const lightFg = resolveForeground(lightRgb.r, lightRgb.g, lightRgb.b);
  const darkFg = resolveForeground(darkRgb.r, darkRgb.g, darkRgb.b);

  return {
    warning,
    light: {
      primary: lightVal,
      'primary-foreground': lightFg.foreground,
      ring: lightVal,
      'chart-1': lightVal,
      'sidebar-primary': lightVal,
      'sidebar-primary-foreground': lightFg.foreground,
      'sidebar-ring': lightVal,
    },
    dark: {
      primary: darkVal,
      'primary-foreground': darkFg.foreground,
      ring: darkVal,
      'chart-1': darkVal,
      'sidebar-primary': darkVal,
      'sidebar-primary-foreground': darkFg.foreground,
      'sidebar-ring': darkVal,
    },
  };
}
