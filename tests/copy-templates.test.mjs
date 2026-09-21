import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  copyTemplates,
  resolveComponentsDir,
  resolveDestinationDir,
  applyAliasReplacements,
} from '../scripts/copy-templates.mjs';

function writeFixture(baseDir, files) {
  for (const [subPath, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, subPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

test('F3.7: applyAliasReplacements rewrites import paths according to components.json aliases', () => {
  const code = `
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/card";
`;

  const transformed = applyAliasReplacements(code, {
    ui: '@/custom-ui',
    utils: '@/shared/utils',
    components: '@/components-base',
  });

  assert.ok(transformed.includes('from "@/custom-ui/button"'));
  assert.ok(transformed.includes('from "@/shared/utils"'));
  assert.ok(transformed.includes('from "@/components-base/card"'));
});

test('F3.7: resolveComponentsDir and resolveDestinationDir for 3d templates', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-dest-dir-'));
  try {
    writeFixture(tmpDir, {
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
        aliases: { components: '@/src-components' },
      }),
    });

    const report = {
      router: { srcDir: true, appDir: 'src/app' },
      shadcn: { aliases: { components: '@/src-components' } },
    };

    const compDir = resolveComponentsDir(tmpDir, report);
    assert.equal(compDir, 'src/src-components');

    const destDir = resolveDestinationDir('3d', tmpDir, report);
    assert.equal(destDir, 'src/src-components/systems');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.7: copy 3d templates into standard src/components/systems directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-copy-3d-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
        aliases: { ui: '@/components/ui', utils: '@/lib/utils' },
      }),
    });

    const res = copyTemplates('3d', tmpDir);

    assert.equal(res.success, true);
    assert.equal(res.group, '3d');
    assert.equal(res.destinationDir, 'src/components/systems');
    assert.equal(res.copiedCount, 2);
    assert.equal(res.skippedCount, 0);

    const canvasPath = path.join(tmpDir, 'src/components/systems/systems-3d-canvas.tsx');
    const lazyPath = path.join(tmpDir, 'src/components/systems/canvas-lazy.tsx');

    assert.ok(fs.existsSync(canvasPath));
    assert.ok(fs.existsSync(lazyPath));

    const canvasContent = fs.readFileSync(canvasPath, 'utf8');
    assert.ok(canvasContent.includes('Systems3DCanvasImpl'));
    assert.ok(canvasContent.includes('SURFACE'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.7: non-overwriting behavior when file exists without --force', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-no-overwrite-'));
  try {
    const existingCustomCanvas = '// Custom user modifications\nexport default function CustomCanvas() { return null; }';

    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
      }),
      'src/components/systems/systems-3d-canvas.tsx': existingCustomCanvas,
    });

    // Run without --force
    const res = copyTemplates('3d', tmpDir, { force: false });

    assert.equal(res.success, true);
    assert.equal(res.copiedCount, 1); // canvas-lazy was copied
    assert.equal(res.skippedCount, 1); // systems-3d-canvas was skipped
    assert.ok(res.warnings.length > 0);
    assert.ok(res.warnings[0].includes('already exists with different content'));

    // Verify existing content was preserved intact
    const preservedContent = fs.readFileSync(
      path.join(tmpDir, 'src/components/systems/systems-3d-canvas.tsx'),
      'utf8'
    );
    assert.equal(preservedContent, existingCustomCanvas);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.7: --force overwrites existing file and creates backup in .frontend-kit/backup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-force-overwrite-'));
  try {
    const existingCustomCanvas = '// Custom user modifications';

    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
      }),
      'src/components/systems/systems-3d-canvas.tsx': existingCustomCanvas,
    });

    // Run with --force
    const res = copyTemplates('3d', tmpDir, { force: true });

    assert.equal(res.success, true);
    assert.equal(res.copiedCount, 2);
    assert.equal(res.skippedCount, 0);

    const overwrittenFile = res.files.find((f) => f.target.endsWith('systems-3d-canvas.tsx'));
    assert.equal(overwrittenFile.status, 'overwritten');
    assert.ok(overwrittenFile.backupPath);
    assert.ok(fs.existsSync(overwrittenFile.backupPath));

    const backupContent = fs.readFileSync(overwrittenFile.backupPath, 'utf8');
    assert.equal(backupContent, existingCustomCanvas);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.7: idempotency - identical existing file is marked unchanged without writing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-idempotent-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
      }),
    });

    // First copy
    const res1 = copyTemplates('3d', tmpDir);
    assert.equal(res1.copiedCount, 2);

    // Second copy (idempotent)
    const res2 = copyTemplates('3d', tmpDir);
    assert.equal(res2.copiedCount, 0);
    assert.equal(res2.skippedCount, 0);
    assert.ok(res2.files.every((f) => f.status === 'unchanged'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3.7: --dry-run does not write to disk but reports changes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-test-dry-run-'));
  try {
    writeFixture(tmpDir, {
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { next: '15.2.0', react: '19.0.0', tailwindcss: '^4.0.0' },
      }),
      'src/app/layout.tsx': '',
      'components.json': JSON.stringify({
        style: 'radix-nova',
        tailwind: { baseColor: 'zinc', css: 'src/app/globals.css' },
      }),
    });

    const res = copyTemplates('3d', tmpDir, { dryRun: true });

    assert.equal(res.success, true);
    assert.equal(res.copiedCount, 2);

    const canvasPath = path.join(tmpDir, 'src/components/systems/systems-3d-canvas.tsx');
    assert.equal(fs.existsSync(canvasPath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
