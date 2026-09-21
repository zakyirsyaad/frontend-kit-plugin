import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCENT_PRESETS,
  RADIUS_PRESETS,
  getAccentTokens,
  contrastRatio,
  relativeLuminance,
  resolveForeground,
  parseHex,
  hexToOklch,
} from '../scripts/lib/identity.mjs';
import { applyTheme } from '../scripts/apply-theme-tokens.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const FRESH_NOVA_PATH = path.join(REPO_ROOT, 'fixtures', 'css', 'fresh-nova-neutral.css');

test('F3.4: all 8 accent presets have contrast ratio >= 4.5:1 for light and dark modes', () => {
  for (const [name, preset] of Object.entries(ACCENT_PRESETS)) {
    const tokens = getAccentTokens(name);
    assert.ok(tokens, `Tokens should be generated for preset ${name}`);

    // Verify light mode contrast
    const lRgb = parseHex(preset.hexLight);
    const lFg = resolveForeground(lRgb.r, lRgb.g, lRgb.b);
    assert.ok(
      lFg.contrast >= 4.5,
      `Preset ${name} light mode contrast ${lFg.contrast.toFixed(2)} must be >= 4.5:1`
    );
    assert.equal(tokens.light['primary-foreground'], lFg.foreground);

    // Verify dark mode contrast
    const dRgb = parseHex(preset.hexDark);
    const dFg = resolveForeground(dRgb.r, dRgb.g, dRgb.b);
    assert.ok(
      dFg.contrast >= 4.5,
      `Preset ${name} dark mode contrast ${dFg.contrast.toFixed(2)} must be >= 4.5:1`
    );
    assert.equal(tokens.dark['primary-foreground'], dFg.foreground);

    // Verify primary, ring, chart-1, sidebar-primary, sidebar-ring
    assert.equal(tokens.light.primary, preset.light);
    assert.equal(tokens.light.ring, preset.light);
    assert.equal(tokens.light['chart-1'], preset.light);
    assert.equal(tokens.light['sidebar-primary'], preset.light);
    assert.equal(tokens.light['sidebar-ring'], preset.light);

    assert.equal(tokens.dark.primary, preset.dark);
    assert.equal(tokens.dark.ring, preset.dark);
    assert.equal(tokens.dark['chart-1'], preset.dark);
    assert.equal(tokens.dark['sidebar-primary'], preset.dark);
    assert.equal(tokens.dark['sidebar-ring'], preset.dark);
  }
});

test('F3.4: advisory warning emitted for violet and indigo presets', () => {
  const violet = getAccentTokens('violet');
  assert.ok(violet.warning && violet.warning.includes('generic AI templates'));

  const indigo = getAccentTokens('indigo');
  assert.ok(indigo.warning && indigo.warning.includes('generic AI templates'));

  const emerald = getAccentTokens('emerald');
  assert.equal(emerald.warning, null);
});

test('F3.4: custom hex colors convert to OKLCH and compute contrast correctly', () => {
  // Dark navy hex #1e3a8a
  const tokens = getAccentTokens('#1e3a8a');
  assert.ok(tokens);
  assert.ok(tokens.light.primary.startsWith('oklch('));
  assert.equal(tokens.light['primary-foreground'], 'oklch(0.985 0 0)', 'Dark background should use light foreground');
});

test('F3.4: hex color with impossible contrast (< 4.5:1 against both white and dark) throws descriptive error', () => {
  // #6366f1 has ~4.47:1 against white and ~4.45:1 against dark zinc, failing WCAG AA 4.5:1
  assert.throws(
    () => getAccentTokens('#6366f1'),
    (err) => {
      return /minimum 4.5:1 required by WCAG AA/.test(err.message);
    }
  );
});

test('F3.4: applyTheme with --accent applies accent tokens to :root and .dark', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  const result = applyTheme(freshCss, {
    palette: 'zinc',
    accent: 'emerald',
    force: true,
  });

  const emeraldPreset = ACCENT_PRESETS.emerald;
  assert.ok(result.css.includes(`--primary: ${emeraldPreset.light};`));
  assert.ok(result.css.includes(`--sidebar-primary: ${emeraldPreset.light};`));
  assert.ok(result.css.includes(`--chart-1: ${emeraldPreset.light};`));

  // Check dark block
  const darkEmerald = emeraldPreset.dark;
  assert.ok(result.css.includes(`--primary: ${darkEmerald};`));
});

test('F3.4: --accent none restores exact palette values', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  // First apply emerald accent
  const withAccent = applyTheme(freshCss, {
    palette: 'zinc',
    accent: 'emerald',
    force: true,
  });

  // Then apply none
  const reverted = applyTheme(withAccent.css, {
    palette: 'zinc',
    accent: 'none',
    force: true,
  });

  const baselineZinc = applyTheme(freshCss, {
    palette: 'zinc',
    force: true,
  });

  assert.equal(reverted.css, baselineZinc.css, '--accent none must revert exactly to pure palette tokens');
});

test('F3.4: status tokens are invariant to accent changes', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  const result1 = applyTheme(freshCss, { palette: 'zinc', accent: 'rose', force: true });
  const result2 = applyTheme(freshCss, { palette: 'zinc', accent: 'blue', force: true });

  const statusLiveRegex = /--status-live:\s*([^;]+);/g;
  const match1 = [...result1.css.matchAll(statusLiveRegex)].map((m) => m[1].trim());
  const match2 = [...result2.css.matchAll(statusLiveRegex)].map((m) => m[1].trim());

  assert.deepEqual(match1, match2, 'Status tokens must be identical regardless of accent');
  assert.ok(result1.css.includes('--destructive: oklch(0.577 0.245 27.325);'), 'Destructive must not change');
});

test('F3.4: radius scale maps sharp, default, soft, and pill (with --radius-control: 9999px)', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  // Sharp
  const sharp = applyTheme(freshCss, { palette: 'zinc', radius: 'sharp', force: true });
  assert.ok(sharp.css.includes('--radius: 0.25rem;'));

  // Soft
  const soft = applyTheme(freshCss, { palette: 'zinc', radius: 'soft', force: true });
  assert.ok(soft.css.includes('--radius: 1rem;'));

  // Pill
  const pill = applyTheme(freshCss, { palette: 'zinc', radius: 'pill', force: true });
  assert.ok(pill.css.includes('--radius: 0.625rem;'));
  assert.ok(pill.css.includes('--radius-control: 9999px;'));

  // Unknown radius throws
  assert.throws(
    () => applyTheme(freshCss, { palette: 'zinc', radius: 'huge' }),
    /Unknown radius 'huge'/
  );

  // Safe mode preserves transitions between standard radius presets
  const safeSharp = applyTheme(freshCss, { palette: 'zinc', radius: 'sharp', force: false });
  assert.equal(safeSharp.skippedCustom.includes('radius'), false, 'Standard radius must not be skipped in safe mode');
  assert.ok(safeSharp.css.includes('--radius: 0.25rem;'));
});

test('F3.4: display font sets --font-heading in @theme inline and reverts on none', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  // Set display font
  const withDisplay = applyTheme(freshCss, {
    palette: 'zinc',
    displayFont: 'cal',
    force: true,
  });
  assert.ok(withDisplay.css.includes('--font-heading: var(--font-cal);'));

  // Revert display font with none
  const reverted = applyTheme(withDisplay.css, {
    palette: 'zinc',
    displayFont: 'none',
    force: true,
  });
  assert.ok(reverted.css.includes('--font-heading: var(--font-sans);'));
});

test('F3.4: idempotency of accent, radius, and display font', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  const firstRun = applyTheme(freshCss, {
    palette: 'zinc',
    accent: 'teal',
    radius: 'pill',
    displayFont: 'playfair',
    force: true,
  });
  assert.equal(firstRun.changed, true);

  const secondRun = applyTheme(firstRun.css, {
    palette: 'zinc',
    accent: 'teal',
    radius: 'pill',
    displayFont: 'playfair',
    force: true,
  });
  assert.equal(secondRun.changed, false);
  assert.equal(secondRun.css, firstRun.css);
});
