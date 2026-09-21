#!/usr/bin/env node
// Read-only: works out everything the blocks skill needs before it touches a project —
// which shadcn components and npm packages are missing, which files would be created or
// collide, the exact commands for the project's package manager, and the routes to open
// during verification. Never writes.

import fs from 'node:fs';
import path from 'node:path';
import { detectProject } from './detect-project.mjs';
import { copyTemplates, BLOCK_MANIFEST, BLOCK_APP_PREFIX } from './copy-templates.mjs';
import { EXIT_CODES } from './lib/fs-safe.mjs';

const BLOCKS_DIR = path.resolve(import.meta.dirname, '..', 'templates', 'blocks');

export function listBlocks() {
  return fs
    .readdirSync(BLOCKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(BLOCKS_DIR, e.name, BLOCK_MANIFEST)))
    .map((e) => readBlock(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readBlock(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return null;
  const file = path.join(BLOCKS_DIR, name, BLOCK_MANIFEST);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// "@tanstack/react-table@^9" -> { name: "@tanstack/react-table", range: "^9" }
export function parseDependency(spec) {
  const at = spec.lastIndexOf('@');
  if (at > 0) return { name: spec.slice(0, at), range: spec.slice(at + 1) };
  return { name: spec, range: null };
}

function majorOf(range) {
  const m = String(range ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// app/dashboard/page.tsx -> /dashboard ; route groups "(x)" are dropped.
export function routeFromAppFile(relPath) {
  if (!relPath.startsWith(BLOCK_APP_PREFIX) || !/\/page\.(t|j)sx?$/.test(relPath)) return null;
  const segments = relPath
    .slice(BLOCK_APP_PREFIX.length)
    .split('/')
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s));
  return `/${segments.join('/')}`;
}

export function planBlock(name, projectDir) {
  const block = readBlock(name);
  if (!block) {
    return {
      block: name,
      stops: [{ code: 'UNKNOWN_BLOCK', message: `No block named "${name}".`, available: listBlocks().map((b) => b.name) }],
    };
  }

  const resolved = path.resolve(projectDir);
  const report = detectProject(resolved, { for: 'doctor' });
  const stops = [...(report.stops ?? [])];
  if (report.monorepo?.detected && !stops.some((s) => s.code === 'MONOREPO')) {
    stops.push({ code: 'MONOREPO', message: 'Monorepos are not supported yet; run the skill inside the app package instead.' });
  }
  if (!report.shadcn?.componentsJson) {
    stops.push({ code: 'NO_SHADCN', message: 'components.json not found. Run /frontend-kit:adopt (or /frontend-kit:create) first.' });
  }
  if (report.tailwind?.major != null && report.tailwind.major < 4) {
    stops.push({ code: 'TAILWIND_V3', message: 'Blocks use Tailwind v4 tokens. Upgrade with `npx @tailwindcss/upgrade` first.' });
  }
  if (!report.router?.appDir) {
    stops.push({ code: 'NO_APP_DIR', message: 'Blocks target the App Router; no app/ directory was found.' });
  }

  const warnings = [];
  if (report.shadcn?.base === 'base') {
    warnings.push('This project uses shadcn Base UI. Blocks are written against the Radix API (asChild); check props like asChild after copying.');
  }

  const installed = new Set(report.shadcn?.installedComponents ?? []);
  const shadcnMissing = block.shadcn.filter((c) => !installed.has(c));

  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf8'));
  } catch {
    // detectProject already reports a missing package.json as a stop.
  }
  const present = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const depsMissing = [];
  for (const spec of block.dependencies) {
    const { name: depName, range } = parseDependency(spec);
    if (!(depName in present)) {
      depsMissing.push(spec);
    } else if (range && majorOf(range) !== majorOf(present[depName])) {
      warnings.push(`${depName} ${present[depName]} is installed but the block is written for ${range}. Upgrade it or adapt the block.`);
    }
  }

  // Blocks import lucide-react, which shadcn only installs when the project chose Lucide.
  // A project on Phosphor, Tabler, … would otherwise fail to build after the copy.
  const blockSources = block.files
    .map((f) => path.join(BLOCKS_DIR, name, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'));
  if (blockSources.some((src) => /from\s+["']lucide-react["']/.test(src))) {
    if (!('lucide-react' in present)) depsMissing.push('lucide-react');
    let iconLibrary = null;
    try {
      iconLibrary = JSON.parse(fs.readFileSync(path.join(resolved, 'components.json'), 'utf8')).iconLibrary ?? null;
    } catch {
      // No components.json is already a stop.
    }
    if (iconLibrary && iconLibrary !== 'lucide') {
      warnings.push(
        `This project's icons are ${iconLibrary}; the block uses lucide-react, which adds a second icon set. Swap the block's icons for ${iconLibrary} ones afterwards if you want one set.`,
      );
    }
  }

  let files = [];
  if (stops.length === 0) {
    const dry = copyTemplates(`blocks/${name}`, resolved, { dryRun: true });
    files = dry.files.map((f) => ({
      target: f.target,
      status: f.status === 'created' ? 'create' : f.status === 'unchanged' ? 'same' : 'conflict',
    }));
  }
  const conflicts = files.filter((f) => f.status === 'conflict').map((f) => f.target);
  if (conflicts.length) {
    warnings.push(`${conflicts.length} file(s) already exist with different content and will be skipped: ${conflicts.join(', ')}`);
  }

  const cmd = report.packageManager?.commands ?? {};
  const shadcnCmd = cmd.shadcn ?? 'npx shadcn@4';
  const commands = {
    shadcnAdd: shadcnMissing.length ? `${shadcnCmd} add ${shadcnMissing.join(' ')} -y` : null,
    addDependencies: depsMissing.length ? `${cmd.add ?? 'npm install'} ${depsMissing.join(' ')}` : null,
    copy: `node "\${CLAUDE_PLUGIN_ROOT}/scripts/copy-templates.mjs" blocks/${name} "${projectDir}"`,
    lint: pkg.scripts?.lint ? `${cmd.run ?? 'npm run'} lint` : null,
    build: pkg.scripts?.build ? `${cmd.run ?? 'npm run'} build` : null,
  };

  const routes = block.files.map(routeFromAppFile).filter(Boolean);

  return {
    block: name,
    description: block.description,
    packageManager: report.packageManager?.name ?? null,
    stops,
    warnings,
    shadcn: { needed: block.shadcn, missing: shadcnMissing },
    dependencies: { needed: block.dependencies, missing: depsMissing },
    files,
    commands,
    verify: {
      routes,
      reviewFiles: files.filter((f) => /\.(t|j)sx$/.test(f.target)).map((f) => f.target),
    },
    nothingToDo: stops.length === 0 && !shadcnMissing.length && !depsMissing.length && files.every((f) => f.status === 'same'),
  };
}

function formatPlan(plan) {
  const lines = [`Block: ${plan.block}`];
  if (plan.stops.length) {
    for (const s of plan.stops) lines.push(`STOP ${s.code}: ${s.message}`);
    return lines.join('\n');
  }
  lines.push(plan.description, '');
  lines.push(`shadcn components: ${plan.shadcn.missing.length ? `add ${plan.shadcn.missing.join(', ')}` : 'all installed'}`);
  lines.push(`npm packages: ${plan.dependencies.missing.length ? `add ${plan.dependencies.missing.join(', ')}` : 'all installed'}`);
  lines.push('files:');
  for (const f of plan.files) lines.push(`  ${f.status === 'create' ? '+' : f.status === 'same' ? '.' : '='} ${f.target} (${f.status})`);
  if (plan.verify.routes.length) lines.push(`routes to open: ${plan.verify.routes.join(', ')}`);
  for (const w of plan.warnings) lines.push(`warning: ${w}`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter((a) => !a.startsWith('--'));

  if (args.includes('--list')) {
    const blocks = listBlocks().map(({ name, description, shadcn, dependencies }) => ({ name, description, shadcn, dependencies }));
    console.log(json ? JSON.stringify(blocks, null, 2) : blocks.map((b) => `${b.name} — ${b.description}`).join('\n'));
    process.exit(EXIT_CODES.OK);
  }

  const [name, projectDir = '.'] = positional;
  if (!name) {
    console.error('Usage: node block-plan.mjs --list [--json] | node block-plan.mjs <block> [project-dir] [--json]');
    process.exit(EXIT_CODES.FIXABLE);
  }

  const plan = planBlock(name, projectDir);
  console.log(json ? JSON.stringify(plan, null, 2) : formatPlan(plan));
  const unsupported = plan.stops.some((s) => s.code !== 'UNKNOWN_BLOCK');
  process.exit(plan.stops.length === 0 ? EXIT_CODES.OK : unsupported ? EXIT_CODES.UNSUPPORTED : EXIT_CODES.FIXABLE);
}
