import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { detectProject } from '../scripts/detect-project.mjs';

const MANIFEST_VERSION = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'),
    'utf8'
  )
).version;

function computeTreeHash(dir) {
  const hashes = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath);
        const fileHash = crypto.createHash('sha256').update(content).digest('hex');
        const rel = path.relative(dir, fullPath).replace(/\\/g, '/');
        hashes.push(`${rel}:${fileHash}`);
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return crypto.createHash('sha256').update(hashes.join('\n')).digest('hex');
}

function writeFixture(baseDir, files) {
  for (const [subPath, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, subPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

test('F3.5: detect-project on standard Bun + Next 15 App Router project', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-bun-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'standard-bun-app',
        dependencies: {
          next: '^15.2.0',
          react: '^19.0.0',
          tailwindcss: '^4.0.0',
          '@tailwindcss/postcss': '^4.0.0',
          geist: '^1.3.0',
          motion: '^12.0.0',
        },
      }, null, 2),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: {
          baseColor: 'zinc',
          cssVariables: true,
          css: 'app/globals.css',
        },
        aliases: {
          components: '@/components',
          utils: '@/lib/utils',
          ui: '@/components/ui',
        },
      }, null, 2),
      'app/globals.css': `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --color-status-live: var(--status-live);
  --color-status-warning: var(--status-warning);
  --color-status-error: var(--status-error);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --status-live: oklch(0.696 0.17 162.48);
  --status-warning: oklch(0.769 0.188 70.08);
  --status-error: oklch(0.637 0.237 25.331);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --status-live: oklch(0.696 0.17 162.48);
  --status-warning: oklch(0.769 0.188 70.08);
  --status-error: oklch(0.637 0.237 25.331);
}
`,
      'app/layout.tsx': `import { GeistSans } from 'geist/font/sans';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>{children}</body>
    </html>
  );
}
`,
      'app/error.tsx': `export default function Error() { return null; }`,
      'app/loading.tsx': `export default function Loading() { return null; }`,
      'lib/utils.ts': `export function cn() {}`,
      'components/ui/button.tsx': `export function Button() {}`,
      'AGENTS.md': `<!-- frontend-kit:core v${MANIFEST_VERSION} -->
# Project Rules
`,
      '.frontend-kit.json': JSON.stringify({
        kitVersion: '0.1.0',
        palette: 'zinc',
      }, null, 2),
    });

    const hashBefore = computeTreeHash(tmpDir);
    const report = detectProject(tmpDir, { for: 'adopt' });
    const hashAfter = computeTreeHash(tmpDir);

    // Tree hash invariance
    assert.equal(hashAfter, hashBefore, 'detectProject must not modify any file in the target project');

    // Asserts on report
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.packageManager.name, 'bun');
    assert.equal(report.packageManager.source, 'lockfile');
    assert.equal(report.packageManager.commands.shadcn, 'bunx --bun shadcn@4');
    assert.equal(report.next.major, 15);
    assert.equal(report.react.major, 19);
    assert.equal(report.router.appDir, 'app');
    assert.equal(report.router.boundaries.error, true);
    assert.equal(report.router.boundaries.loading, true);
    assert.equal(report.router.boundaries.notFound, false);
    assert.equal(report.shadcn.style, 'radix-nova');
    assert.equal(report.shadcn.base, 'radix');
    assert.equal(report.shadcn.baseColor, 'zinc');
    assert.deepEqual(report.shadcn.installedComponents, ['button']);
    assert.deepEqual(report.shadcn.utilsExports, ['cn']);
    assert.equal(report.css.shape, 'shadcn-v4');
    assert.equal(report.css.statusTokens.registered.length, 3);
    assert.equal(report.css.statusTokens.declared.length, 3);
    assert.equal(report.layout.geistPackage, true);
    assert.equal(report.agentDocs.kitSections.core, 'current');
    assert.equal(report.stops.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: pnpm + next-themes + base-nova detection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-pnpm-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'pnpm-app',
        packageManager: 'pnpm@9.5.0',
        dependencies: {
          next: '15.1.0',
          react: '19.0.0',
          tailwindcss: '^4.0.0',
          'next-themes': '^0.4.0',
        },
      }, null, 2),
      'pnpm-lock.yaml': 'lockfileVersion: 5.4',
      'components.json': JSON.stringify({
        style: 'base-nova',
        tailwind: {
          baseColor: 'neutral',
          cssVariables: true,
          css: 'src/app/globals.css',
        },
        aliases: {
          ui: '@/components/ui',
        },
      }, null, 2),
      'src/app/globals.css': `@import "tailwindcss";
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}
`,
      'src/app/layout.tsx': `export default function Layout({ children }) {
  return <html suppressHydrationWarning className="dark">{children}</html>;
}
`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.equal(report.packageManager.name, 'pnpm');
    assert.equal(report.packageManager.source, 'packageManager-field');
    assert.equal(report.packageManager.commands.shadcn, 'pnpm dlx shadcn@4');
    assert.equal(report.router.appDir, 'src/app');
    assert.equal(report.router.srcDir, true);
    assert.equal(report.shadcn.style, 'base-nova');
    assert.equal(report.shadcn.base, 'base');
    assert.equal(report.darkMode.mode, 'next-themes');
    assert.equal(report.layout.suppressHydrationWarning, true);
    assert.equal(report.layout.htmlClassName.hasDark, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Yarn Berry and legacy AGENTS marker detection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-yarn-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'yarn-berry-app',
        packageManager: 'yarn@4.2.0',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'yarn.lock': '',
      '.yarnrc.yml': 'yarnPath: .yarn/releases/yarn-4.2.0.cjs',
      'app/globals.css': `@import "tailwindcss";
:root { --background: oklch(1 0 0); }
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
      'CLAUDE.md': `@AGENTS.md`,
      'AGENTS.md': `# Frontend Rules d621e65`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.equal(report.packageManager.name, 'yarn');
    assert.equal(report.packageManager.yarnBerry, true);
    assert.equal(report.packageManager.commands.shadcn, 'yarn dlx shadcn@4');
    assert.equal(report.agentDocs.claudeImportsAgents, true);
    assert.equal(report.agentDocs.rulesTarget, 'AGENTS.md');
    assert.equal(report.agentDocs.kitSections.core, 'legacy');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Multiple lockfiles triggers warning and resolves priority', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-multilock-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'multi-lock-app',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'package-lock.json': '{}',
      'bun.lock': '',
      'app/globals.css': `@import "tailwindcss";
:root { --background: oklch(1 0 0); }
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.equal(report.packageManager.ambiguous, true);
    assert.equal(report.packageManager.name, 'bun'); // bun > npm tie-breaker
    assert.ok(report.warnings.some((w) => w.code === 'MULTIPLE_LOCKFILES'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Stop code TAILWIND_V3 triggers on v3 config and directives', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-tw3-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'tw3-app',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^3.4.1',
        },
      }, null, 2),
      'tailwind.config.js': 'module.exports = {};',
      'app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;
:root { --background: #ffffff; }
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.ok(report.stops.some((s) => s.code === 'TAILWIND_V3'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Stop code PAGES_ROUTER_ONLY triggers when only pages/ exists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-pages-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'pages-only-app',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'pages/index.tsx': 'export default function Home() { return null; }',
      'styles/globals.css': `@import "tailwindcss";
:root { --background: oklch(1 0 0); }
`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.ok(report.stops.some((s) => s.code === 'PAGES_ROUTER_ONLY'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Stop code MONOREPO triggers when workspaces or turbo.json exists in adopt', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-monorepo-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'monorepo-app',
        workspaces: ['apps/*'],
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'turbo.json': '{}',
      'app/globals.css': `@import "tailwindcss";
:root { --background: oklch(1 0 0); }
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.equal(report.monorepo.detected, true);
    assert.ok(report.stops.some((s) => s.code === 'MONOREPO'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Stop code CSS_HSL_WRAPPED triggers when hsl(var(--*)) is used', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-hsl-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'hsl-app',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'components.json': JSON.stringify({ style: 'radix-nova' }, null, 2),
      'app/globals.css': `@import "tailwindcss";
:root {
  --background: 0 0% 100%;
}
@theme inline {
  --color-background: hsl(var(--background));
}
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.equal(report.css.hslWrappedTheme, true);
    assert.ok(report.stops.some((s) => s.code === 'CSS_HSL_WRAPPED'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: Dark root detection correctly identifies dark scheme', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-darkroot-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'dark-app',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'app/globals.css': `@import "tailwindcss";
:root {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
    });

    const report = detectProject(tmpDir, { for: 'adopt' });

    assert.equal(report.css.rootScheme, 'dark');
    assert.equal(report.darkMode.mode, 'static-dark');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: CLI modes (--for create and --for doctor)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-modes-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'mode-test-app',
        dependencies: {
          next: '^15.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'app/globals.css': `@import "tailwindcss";
:root { --background: oklch(1 0 0); }
`,
      'app/layout.tsx': `export default function Layout({ children }) { return <html>{children}</html>; }`,
    });

    const createReport = detectProject(tmpDir, { for: 'create' });
    assert.ok(createReport.createChecks);
    assert.equal(createReport.createChecks.next, true);

    const doctorReport = detectProject(tmpDir, { for: 'doctor' });
    assert.ok(doctorReport.doctorReport);
    assert.equal(doctorReport.doctorReport.pluginVersion, MANIFEST_VERSION);
    assert.equal(doctorReport.kitVersion, MANIFEST_VERSION);
    assert.ok(doctorReport.doctorReport.suggestedCommands.includes('/frontend-kit:adopt'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: createChecks.layout stays false until geist and the dark class are both in place', () => {
  const base = {
    'package.json': JSON.stringify({
      name: 'resume-app',
      dependencies: { next: '^16.0.0', react: '19.2.8', tailwindcss: '^4.0.0' },
    }, null, 2),
    'bun.lock': '',
    'src/app/globals.css': '@import "tailwindcss";\n\n@theme inline {\n  --color-background: var(--background);\n}\n\n:root {\n  --background: oklch(1 0 0);\n}\n\n.dark {\n  --background: oklch(0.141 0.005 285.823);\n}\n',
  };
  const cases = [
    {
      name: 'fresh create-next-app layout (Google Geist, no dark class)',
      layout: 'import { Geist } from "next/font/google";\nconst geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });\nexport default function RootLayout({ children }) {\n  return (<html lang="en" className={`${geistSans.variable} antialiased`}>{children}</html>);\n}\n',
      expected: false,
    },
    {
      name: 'geist package but still no dark class',
      layout: 'import { GeistSans } from "geist/font/sans";\nexport default function RootLayout({ children }) {\n  return (<html lang="en" className={`${GeistSans.variable} antialiased`}>{children}</html>);\n}\n',
      expected: false,
    },
    {
      name: 'phase 4 finished: geist package and dark class',
      layout: 'import { GeistSans } from "geist/font/sans";\nexport default function RootLayout({ children }) {\n  return (<html lang="en" className={`dark ${GeistSans.variable} antialiased`}>{children}</html>);\n}\n',
      expected: true,
    },
  ];

  for (const testCase of cases) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-resume-'));
    try {
      writeFixture(tmpDir, { ...base, 'src/app/layout.tsx': testCase.layout });
      const result = detectProject(tmpDir, { for: 'create' });
      assert.strictEqual(
        result.createChecks.layout,
        testCase.expected,
        `${testCase.name}: expected createChecks.layout === ${testCase.expected}`
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test('F3.5: accent tokens do not make an accented project report as a custom palette', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-accent-'));
  try {
    const zinc = JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'palettes', 'zinc.json'), 'utf8')
    );
    // Every zinc token at its snapshot value, except the seven the identity
    // layer owns, which carry an orange accent instead.
    const accentOverrides = {
      primary: 'oklch(0.646 0.222 41.116)',
      'primary-foreground': 'oklch(0.985 0 0)',
      ring: 'oklch(0.646 0.222 41.116)',
      'chart-1': 'oklch(0.646 0.222 41.116)',
      'sidebar-primary': 'oklch(0.646 0.222 41.116)',
      'sidebar-primary-foreground': 'oklch(0.985 0 0)',
      'sidebar-ring': 'oklch(0.646 0.222 41.116)',
    };
    const render = (mode) =>
      Object.entries({ ...zinc[mode], ...accentOverrides })
        .map(([k, v]) => `  --${k}: ${v};`)
        .join('\n');

    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'accented', dependencies: { next: '^16.0.0', react: '19.2.8', tailwindcss: '^4.0.0' },
      }, null, 2),
      'bun.lock': '',
      'src/app/layout.tsx': 'export default function RootLayout({ children }) { return <html lang="en">{children}</html>; }\n',
      'src/app/globals.css': `@import "tailwindcss";\n\n@theme inline {\n  --color-background: var(--background);\n}\n\n:root {\n${render('light')}\n}\n\n.dark {\n${render('dark')}\n}\n`,
    });

    const report = detectProject(tmpDir, { for: 'doctor' });
    assert.strictEqual(report.css.palette.root, 'zinc', 'base palette is still zinc');
    assert.strictEqual(report.css.palette.dark, 'zinc');
    assert.ok(
      !report.css.palette.customTokens.includes('primary'),
      'accent-owned tokens are not reported as hand-customized'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.5: a plain pnpm app is not a monorepo just because pnpm-workspace.yaml exists', () => {
  const base = {
    'package.json': JSON.stringify({
      name: 'pnpm-app', dependencies: { next: '^16.0.0', react: '19.2.8', tailwindcss: '^4.0.0' },
    }, null, 2),
    'pnpm-lock.yaml': '',
    'src/app/layout.tsx': 'export default function RootLayout({ children }) { return <html lang="en">{children}</html>; }\n',
    'src/app/globals.css': '@import "tailwindcss";\n\n@theme inline {\n  --color-background: var(--background);\n}\n\n:root {\n  --background: oklch(1 0 0);\n}\n\n.dark {\n  --background: oklch(0.141 0.005 285.823);\n}\n',
  };

  // What create-next-app --use-pnpm writes for a standalone app.
  const appOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-pnpm-app-'));
  // A real workspace root.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-pnpm-ws-'));
  try {
    writeFixture(appOnly, { ...base, 'pnpm-workspace.yaml': 'allowBuilds:\n  sharp: false\n' });
    const appReport = detectProject(appOnly, { for: 'adopt' });
    assert.strictEqual(appReport.monorepo.detected, false, 'allowBuilds alone is not a workspace');
    assert.ok(
      !appReport.stops.some((s) => s.code === 'MONOREPO'),
      'adopt must not refuse a standalone pnpm project'
    );

    writeFixture(workspace, { ...base, 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n" });
    const wsReport = detectProject(workspace, { for: 'adopt' });
    assert.strictEqual(wsReport.monorepo.detected, true, 'a packages: list is a real workspace');
    assert.ok(wsReport.stops.some((s) => s.code === 'MONOREPO'));
  } finally {
    fs.rmSync(appOnly, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('fix: a declared range without a dot ("^4", "^3") is read without node_modules', async () => {
  const { parseMajorVersion } = await import('../scripts/detect-project.mjs');
  assert.equal(parseMajorVersion('^4'), 4);
  assert.equal(parseMajorVersion('~15.3'), 15);
  assert.equal(parseMajorVersion('4.3.1'), 4);
  assert.equal(parseMajorVersion('latest'), null);

  // A fresh clone of a Tailwind v3 app must still stop adopt and blocks.
  const { planBlock } = await import('../scripts/block-plan.mjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-detect-short-range-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src/app/layout.tsx'), '');
    fs.writeFileSync(path.join(tmpDir, 'src/app/globals.css'), '@tailwind base;\n');
    fs.writeFileSync(path.join(tmpDir, 'components.json'), JSON.stringify({ style: 'new-york', tailwind: { css: 'src/app/globals.css' } }));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'app', dependencies: { next: '^15', react: '^19', tailwindcss: '^3' } }));
    const report = detectProject(tmpDir, { for: 'adopt' });
    assert.equal(report.tailwind.major, 3);
    assert.equal(report.next.major, 15);
    assert.ok(report.stops.some((s) => s.code === 'TAILWIND_V3'), JSON.stringify(report.stops));
    assert.ok(planBlock('state-panel', tmpDir).stops.some((s) => s.code === 'TAILWIND_V3'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
