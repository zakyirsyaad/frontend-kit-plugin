import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { composeRules, writeRules } from '../scripts/write-rules.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
).version;

function writeFixture(baseDir, files) {
  for (const [subPath, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, subPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

test('F3.6: target resolution when neither AGENTS.md nor CLAUDE.md exists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-target-new-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0', geist: '^1.3.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
        aliases: { ui: '@/components/ui', utils: '@/lib/utils' },
      }),
      'app/globals.css': '@import "tailwindcss";',
    });

    const res = writeRules(tmpDir, { target: 'auto' });

    assert.equal(res.success, true);
    assert.equal(res.targetPath, 'AGENTS.md');
    assert.equal(res.targetCreated, true);
    assert.equal(res.claudeMdCreated, true);
    assert.equal(res.changed, true);

    const agentsContent = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.ok(agentsContent.includes(`<!-- frontend-kit:core v${MANIFEST_VERSION} -->`));
    assert.ok(agentsContent.includes('<!-- /frontend-kit:core -->'));

    const claudeContent = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.equal(claudeContent.trim(), '@AGENTS.md');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: target resolution with existing CLAUDE.md importing @AGENTS.md', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-target-existing-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
        aliases: { ui: '@/components/ui', utils: '@/lib/utils' },
      }),
      'app/globals.css': '@import "tailwindcss";',
      'CLAUDE.md': '@AGENTS.md\n',
      'AGENTS.md': '# Custom User Instructions\n\nBe polite.\n',
    });

    const res = writeRules(tmpDir, { target: 'auto' });

    assert.equal(res.success, true);
    assert.equal(res.targetPath, 'AGENTS.md');
    assert.equal(res.targetCreated, false);
    assert.equal(res.claudeMdCreated, false);

    const agentsContent = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.ok(agentsContent.includes('# Custom User Instructions\n\nBe polite.'));
    assert.ok(agentsContent.includes(`<!-- frontend-kit:core v${MANIFEST_VERSION} -->`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: target resolution when only CLAUDE.md exists without @AGENTS.md', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-target-claude-only-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
      }),
      'app/globals.css': '@import "tailwindcss";',
      'CLAUDE.md': '# Claude Instructions\n',
    });

    const res = writeRules(tmpDir, { target: 'auto' });

    assert.equal(res.success, true);
    assert.equal(res.targetPath, 'CLAUDE.md');
    assert.equal(res.claudeMdCreated, false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);

    const claudeContent = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeContent.includes('# Claude Instructions'));
    assert.ok(claudeContent.includes(`<!-- frontend-kit:core v${MANIFEST_VERSION} -->`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: placeholder substitution for pnpm and custom aliases and palette', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-placeholders-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-pnpm-app',
        packageManager: 'pnpm@9.5.0',
        dependencies: {
          next: '15.2.0',
          react: '19.0.0',
          tailwindcss: '^4.0.0',
          gsap: '^3.12.0',
          '@react-three/fiber': '^8.17.0',
        },
      }),
      'pnpm-lock.yaml': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'neutral', css: 'src/app/globals.css' },
        aliases: { ui: '@/ui-primitives', utils: '@/common/utils' },
      }),
      'src/app/globals.css': '@import "tailwindcss";',
      'src/app/layout.tsx': 'export default function Layout({ children }) { return <html>{children}</html>; }',
    });

    const comp = composeRules(tmpDir);

    assert.equal(comp.placeholders['{{shadcn}}'], 'pnpm dlx shadcn@4');
    assert.equal(comp.placeholders['{{info}}'], 'pnpm info');
    assert.equal(comp.placeholders['{{uiAlias}}'], '@/ui-primitives');
    assert.equal(comp.placeholders['{{utilsAlias}}'], '@/common/utils');
    assert.equal(comp.placeholders['{{palette}}'], 'neutral');
    assert.ok(comp.placeholders['{{fontRule}}'].includes('Keep the project\'s fonts self-hosted'));

    // Verify GSAP and 3D were auto-detected
    const sectionNames = comp.sections.map((s) => s.name);
    assert.deepEqual(sectionNames, ['core', 'gsap', '3d']);

    const res = writeRules(tmpDir, { target: 'AGENTS.md' });
    assert.equal(res.success, true);
    assert.deepEqual(res.sections, ['core', 'gsap', '3d']);

    const agentsContent = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.ok(agentsContent.includes(`<!-- frontend-kit:core v${MANIFEST_VERSION} -->`));
    assert.ok(agentsContent.includes(`<!-- frontend-kit:gsap v${MANIFEST_VERSION} -->`));
    assert.ok(agentsContent.includes(`<!-- frontend-kit:3d v${MANIFEST_VERSION} -->`));
    assert.ok(agentsContent.includes('pnpm dlx shadcn@4 add @magicui/<name>'));
    assert.ok(agentsContent.includes('pnpm info @react-three/fiber peerDependencies'));
    assert.ok(agentsContent.includes('from `@/ui-primitives`'));
    assert.ok(agentsContent.includes('`cn()` from `@/common/utils`'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: idempotency and updating existing marked blocks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-idempotency-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
      }),
      'app/globals.css': '@import "tailwindcss";',
    });

    const res1 = writeRules(tmpDir);
    assert.equal(res1.changed, true);

    const res2 = writeRules(tmpDir);
    assert.equal(res2.changed, false);

    // Now simulate an older version inside the marker
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    let content = fs.readFileSync(agentsPath, 'utf8');
    content = content.replace('<!-- frontend-kit:core v0.1.0 -->', '<!-- frontend-kit:core v0.0.9 -->');
    content = content.replace('Rules for this project', 'Old rules for this project');
    fs.writeFileSync(agentsPath, content);

    const res3 = writeRules(tmpDir);
    assert.equal(res3.changed, true);

    const updated = fs.readFileSync(agentsPath, 'utf8');
    assert.ok(updated.includes(`<!-- frontend-kit:core v${MANIFEST_VERSION} -->`));
    assert.ok(updated.includes('Rules for this project'));
    assert.ok(!updated.includes('v0.0.9'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: migration of verbatim legacy d621e65 core rules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-legacy-verbatim-'));
  try {
    const legacyVerbatimCore = `# Frontend Systems Engineering Rules

Rules for this project (scaffolded by the \`create-systems-frontend\` skill). Follow them when writing components.

## Bundle & Loading
- **Fonts**: Geist is self-hosted through the \`geist\` package (\`geist/font/sans\`, \`geist/font/mono\`) in \`src/app/layout.tsx\`, wired to \`font-sans\`/\`font-mono\`. Do not switch to \`next/font/google\` or add a \`<link>\` to Google Fonts — builds must not depend on the network for fonts.

## Component Composition (shadcn/ui Radix + registries)
- **Primitives first**: use \`<Button>\`, \`<Badge>\`, \`<Card>\`, \`<Tabs>\`, \`<Dialog>\` from \`@/components/ui\` — no clickable \`div\`s.
- **Forms**: \`<FieldGroup>\` + \`<Field>\` (\`@/components/ui/field\`), not ad-hoc \`space-y-*\` wrappers.
- **Registry components**: \`bunx --bun shadcn@4 add @aceternity/<name>\` or \`@magicui/<name>\`; review the generated file before using it — it becomes your code.
- **Class merging**: \`cn()\` from \`@/lib/utils\`.

## Tokens
- **Tokens over hex**: \`bg-background\`, \`bg-card\`, \`bg-secondary\`, \`border-border\`, \`text-primary\`, \`text-muted-foreground\`, \`bg-status-live\`, \`bg-status-warning\`, \`bg-status-error\`. Never raw hex/oklch in \`className\`.
- **Status colors are signals, not text**: use them for dots, icons, badges and borders, and always pair them with a text label (color alone is not accessible). For body-size text use \`text-foreground\`/\`text-muted-foreground\`; \`text-status-warning\` on white is below 4.5:1.
- **Change the palette** by editing \`DARK\`/\`LIGHT\` in \`~/.claude/skills/create-systems-frontend/scripts/apply-theme-tokens.mjs\` and running \`bun <that file> .\` from the project root — not by hand-editing token values in \`globals.css\`.
- **Sizing**: \`size-4\`, \`size-10\` instead of \`w-4 h-4\`.

## Motion
- Import from \`motion/react\` (not \`framer-motion\`).
- Respect reduced motion: \`useReducedMotion()\` gates non-essential movement.
- Animate \`transform\`/\`opacity\` only; avoid animating \`width\`/\`height\`/\`top\`.`;

    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0', geist: '^1.3.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
        aliases: { ui: '@/components/ui', utils: '@/lib/utils' },
      }),
      'app/globals.css': '@import "tailwindcss";',
      'AGENTS.md': `# User Heading\n\nSome introductory content.\n\n${legacyVerbatimCore}\n\n# Trailing Custom Rules\n\nCustom rule here.\n`,
    });

    const res = writeRules(tmpDir, { target: 'AGENTS.md' });

    assert.equal(res.success, true);
    assert.equal(res.legacyMigrated, true);
    assert.equal(res.warnings.length, 0);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes(`<!-- frontend-kit:core v${MANIFEST_VERSION} -->`));
    assert.ok(content.includes('# User Heading'));
    assert.ok(content.includes('# Trailing Custom Rules'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: modified legacy block is preserved with warning', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-legacy-modified-'));
  try {
    const modifiedLegacy = `# Frontend Systems Engineering Rules

This has been modified by the developer with bespoke team rules.
Do not overwrite me!`;

    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
      }),
      'app/globals.css': '@import "tailwindcss";',
      'AGENTS.md': `${modifiedLegacy}\n`,
    });

    const res = writeRules(tmpDir, { target: 'AGENTS.md' });

    assert.equal(res.success, true);
    assert.equal(res.legacyMigrated, false);
    assert.ok(res.warnings.some((w) => w.includes('skipping automatic replacement')));

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    // Bespoke content preserved
    assert.ok(content.includes('This has been modified by the developer'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: --gate flag detects non-applicable project and skips', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-gate-'));
  try {
    // Missing components.json -> not applicable
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'non-shadcn-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'bun.lock': '',
      'app/globals.css': '@import "tailwindcss";',
    });

    const res = writeRules(tmpDir, { gate: true });

    assert.equal(res.success, true);
    assert.equal(res.gatePassed, false);
    assert.ok(res.message.includes('frontend-kit rules: not applicable'));
    assert.equal(res.changed, false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.6: --print flag returns rules without comment markers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-rules-print-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'test-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0', geist: '^1.3.0' },
      }),
      'bun.lock': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'app/globals.css' },
      }),
      'app/globals.css': '@import "tailwindcss";',
    });

    const res = writeRules(tmpDir, { print: true });

    assert.equal(res.success, true);
    assert.equal(res.gatePassed, true);
    assert.ok(res.printText);
    assert.ok(!res.printText.includes('<!-- frontend-kit:core'));
    assert.ok(res.printText.includes('# Frontend Systems Engineering Rules'));
    assert.equal(fs.existsSync(path.join(tmpDir, 'AGENTS.md')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
