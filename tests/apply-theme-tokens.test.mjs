import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  applyTheme,
  loadPalettes,
  updateComponentsJson,
  updateFrontendKitMeta,
} from '../scripts/apply-theme-tokens.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const FRESH_NOVA_PATH = path.join(REPO_ROOT, 'fixtures', 'css', 'fresh-nova-neutral.css');
const GOLDEN_ZINC_PATH = path.join(REPO_ROOT, 'fixtures', 'css', 'golden-zinc-d621e65.css');

test('F3.3: golden fixture matches d621e65 baseline byte-for-byte', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');
  const expectedGoldenCss = fs.readFileSync(GOLDEN_ZINC_PATH, 'utf8');

  const result = applyTheme(freshCss, {
    palette: 'zinc',
    force: true,
    fontSans: 'geist',
    status: true,
  });

  assert.equal(result.changed, true);
  assert.equal(result.css, expectedGoldenCss, 'Output must be byte-identical to golden-zinc-d621e65.css');
});

test('F3.3: idempotency - second run produces changed: false and identical css', () => {
  const goldenCss = fs.readFileSync(GOLDEN_ZINC_PATH, 'utf8');

  const result = applyTheme(goldenCss, {
    palette: 'zinc',
    force: true,
    fontSans: 'geist',
    status: true,
  });

  assert.equal(result.changed, false);
  assert.equal(result.css, goldenCss);
  assert.equal(result.replaced.length, 0);
  assert.equal(result.appended.length, 0);
  assert.equal(result.registered.length, 0);
});

test('F3.3: round-trip zinc -> slate -> zinc preserves exact byte structure', () => {
  const goldenZinc = fs.readFileSync(GOLDEN_ZINC_PATH, 'utf8');

  const toSlate = applyTheme(goldenZinc, {
    palette: 'slate',
    force: true,
    fontSans: 'geist',
    status: true,
  });
  assert.equal(toSlate.changed, true);

  const backToZinc = applyTheme(toSlate.css, {
    palette: 'zinc',
    force: true,
    fontSans: 'geist',
    status: true,
  });

  assert.equal(backToZinc.changed, true);
  assert.equal(backToZinc.css, goldenZinc, 'Zinc -> Slate -> Zinc must return to exact golden Zinc bytes');
});

test('F3.3: CRLF line endings are preserved transparently', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');
  const crlfCss = freshCss.replace(/\n/g, '\r\n');
  assert.ok(crlfCss.includes('\r\n'));

  const result = applyTheme(crlfCss, {
    palette: 'zinc',
    force: true,
    fontSans: 'geist',
  });

  assert.equal(result.changed, true);
  assert.ok(result.css.includes('\r\n'));
  assert.ok(!result.css.replace(/\r\n/g, '').includes('\n'), 'All newlines must be CRLF');
});

test('F3.3: dark root (dark :root, no .dark block) applies dark tokens to :root when no .dark block exists', () => {
  const darkRootCss = `
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}

:root {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
}
`;

  const result = applyTheme(darkRootCss, {
    palette: 'stone',
    force: true,
  });

  assert.equal(result.rootScheme, 'dark');
  const stonePalette = loadPalettes().get('stone');
  assert.ok(result.css.includes(`--foreground: ${stonePalette.dark.foreground};`));
});

test('F3.3: safe mode preserves custom tokens unless --force is given', () => {
  const customCss = `
@theme inline {
  --color-background: var(--background);
}

:root {
  --background: oklch(0.999 0.123 45.67); /* custom branded background */
  --foreground: oklch(0.145 0 0); /* neutral standard */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}
`;

  // Safe run: custom background should be skipped
  const safeResult = applyTheme(customCss, {
    palette: 'zinc',
    force: false,
    status: false,
  });

  assert.ok(safeResult.skippedCustom.includes('background'));
  assert.ok(safeResult.css.includes('oklch(0.999 0.123 45.67)'), 'Custom value must be preserved in safe mode');

  // Forced run: custom background should be replaced
  const forceResult = applyTheme(customCss, {
    palette: 'zinc',
    force: true,
    status: false,
  });

  const zincPalette = loadPalettes().get('zinc');
  assert.ok(!forceResult.skippedCustom.includes('background'));
  assert.ok(forceResult.css.includes(`--background: ${zincPalette.light.background};`));
});

test('F3.3: --keep preserves specified tokens', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  const result = applyTheme(freshCss, {
    palette: 'zinc',
    force: true,
    keep: ['primary', 'primary-foreground'],
    status: false,
  });

  assert.ok(result.kept.includes('primary'));
  assert.ok(result.kept.includes('primary-foreground'));
  // Neutral primary was oklch(0.205 0 0)
  assert.ok(result.css.includes('--primary: oklch(0.205 0 0);'));
});

test('F3.3: throws descriptive error on missing blocks', () => {
  assert.throws(() => applyTheme('body { color: red; }', { palette: 'zinc' }), {
    message: /no `:root \{ \.\.\. \}` block found/,
  });

  assert.throws(() => applyTheme(':root { --background: #fff; }', { palette: 'zinc' }), {
    message: /no `@theme inline \{ \.\.\. \}` block found/,
  });
});

test('F3.3: throws unsupported error on HSL-wrapped tokens', () => {
  const hslCss = `
@theme inline {
  --color-background: hsl(var(--background));
}
:root {
  --background: 0 0% 100%;
}
`;

  assert.throws(
    () => applyTheme(hslCss, { palette: 'zinc' }),
    (err) => {
      return err.code === 2 && /HSL-wrapped variables/.test(err.message);
    }
  );
});

test('F3.3: status tokens are registered exactly once in @theme inline', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  const first = applyTheme(freshCss, { palette: 'zinc', status: true });
  assert.equal(first.registered.length, 3);

  const second = applyTheme(first.css, { palette: 'zinc', status: true });
  assert.equal(second.registered.length, 0);

  const matches = second.css.match(/--color-status-live:/g);
  assert.equal(matches.length, 1, 'Should appear exactly once');
});

test('F3.3: unknown palette lists all 9 available palettes', () => {
  const freshCss = fs.readFileSync(FRESH_NOVA_PATH, 'utf8');

  assert.throws(
    () => applyTheme(freshCss, { palette: 'nonexistent' }),
    (err) => {
      const msg = err.message;
      return (
        msg.includes("Unknown palette 'nonexistent'") &&
        ['neutral', 'zinc', 'stone', 'gray', 'slate', 'mauve', 'olive', 'mist', 'taupe'].every((p) =>
          msg.includes(p)
        )
      );
    }
  );
});

test('F3.3: updateComponentsJson updates tailwind.baseColor cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, 'fixtures', 'tmp-comp-'));
  try {
    const compJson = {
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'new-york',
      tailwind: {
        config: '',
        css: 'src/app/globals.css',
        baseColor: 'neutral',
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'components.json'), JSON.stringify(compJson, null, 2) + '\n');

    const update = updateComponentsJson(tmpDir, 'zinc');
    assert.equal(update.changed, true);
    assert.equal(update.from, 'neutral');
    assert.equal(update.to, 'zinc');

    const updatedData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'components.json'), 'utf8'));
    assert.equal(updatedData.tailwind.baseColor, 'zinc');

    // Second run is unchanged
    const second = updateComponentsJson(tmpDir, 'zinc');
    assert.equal(second.changed, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.3: updateFrontendKitMeta writes .frontend-kit.json with palette', () => {
  const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, 'fixtures', 'tmp-meta-'));
  try {
    const meta = updateFrontendKitMeta(tmpDir, 'stone');
    assert.equal(meta.palette, 'stone');
    assert.equal(meta.accent, 'none');
    assert.equal(meta.radius, 'default');
    assert.ok(meta.updatedAt);

    const readBack = JSON.parse(fs.readFileSync(path.join(tmpDir, '.frontend-kit.json'), 'utf8'));
    assert.equal(readBack.palette, 'stone');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.3: .frontend-kit.json records kitVersion and is written even when the css is unchanged', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-meta-'));
  try {
    const metaPath = path.join(tmpDir, '.frontend-kit.json');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')
    );

    // A project stamped by an older kit, already on the right palette.
    fs.writeFileSync(metaPath, `${JSON.stringify({ kitVersion: '0.0.1', palette: 'zinc', accent: 'none', radius: 'default', displayFont: 'none' }, null, 2)}\n`);

    const first = updateFrontendKitMeta(tmpDir, { palette: 'zinc' });
    assert.strictEqual(first.kitVersion, manifest.version, 'kitVersion follows the installed plugin');
    assert.strictEqual(first.changed, true, 'a version bump counts as a change');

    const afterFirst = fs.readFileSync(metaPath, 'utf8');
    const second = updateFrontendKitMeta(tmpDir, { palette: 'zinc' });
    assert.strictEqual(second.changed, false, 'a second identical run changes nothing');
    assert.strictEqual(fs.readFileSync(metaPath, 'utf8'), afterFirst, 'file is byte-identical, updatedAt does not churn');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fix: safe mode keeps a brand token that happens to equal another palette value', () => {
  const gray = loadPalettes().get('gray');
  // A custom dark stylesheet: the background equals gray's dark background by coincidence,
  // everything else is the project's own. Seen on a real project (brand navy).
  const css = [
    '@import "tailwindcss";',
    '',
    ':root {',
    `  --background: ${gray.dark.background};`,
    '  --foreground: oklch(0.97 0.01 250);',
    '  --card: oklch(0.2 0.03 250);',
    '  --muted: oklch(0.3 0.02 250);',
    '  --border: oklch(0.32 0.02 250);',
    '  --radius: 0.5rem;',
    '}',
    '',
    '@theme inline {',
    '  --color-background: var(--background);',
    '}',
    '',
  ].join('\n');

  const safe = applyTheme(css, { palette: 'zinc' });
  assert.ok(!safe.replaced.some((t) => t.endsWith('.background')), JSON.stringify(safe.replaced));
  assert.ok(safe.skippedCustom.includes('background'));
  assert.ok(safe.css.includes(`--background: ${gray.dark.background};`));
  // Missing tokens are still added, and --force still overrides everything.
  assert.ok(safe.appended.some((t) => t.endsWith('.status-live')));
  const forced = applyTheme(css, { palette: 'zinc', force: true });
  assert.ok(forced.replaced.some((t) => t.endsWith('.background')));
});
