#!/usr/bin/env node
// Canary helper: installs every block into a scaffolded app the way /frontend-kit:blocks
// does — block-plan for what is missing, shadcn add, package install, copy-templates —
// then drops a page that renders the blocks without a route of their own.
//
// Usage: node tests/canary/install-blocks.mjs <app-dir>

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { listBlocks, planBlock } from '../../scripts/block-plan.mjs';
import { copyTemplates } from '../../scripts/copy-templates.mjs';

const app = path.resolve(process.argv[2] ?? '.');
const run = (cmd) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: app, stdio: ['ignore', 'inherit', 'inherit'] });
};

const routes = [];
for (const { name } of listBlocks()) {
  const plan = planBlock(name, app);
  if (plan.stops.length) throw new Error(`${name}: ${plan.stops.map((s) => s.code).join(', ')}`);
  if (plan.commands.shadcnAdd) run(plan.commands.shadcnAdd);
  // A closed prompt exits 0 without installing, so check the result, not the exit code.
  const after = planBlock(name, app);
  if (after.shadcn.missing.length) throw new Error(`${name}: shadcn add left ${after.shadcn.missing.join(', ')} missing`);
  if (plan.commands.addDependencies) run(plan.commands.addDependencies);
  const copied = copyTemplates(`blocks/${name}`, app);
  if (copied.skippedCount) throw new Error(`${name}: ${copied.warnings.join('; ')}`);
  routes.push(...plan.verify.routes);
  console.log(`✔ ${name}: ${copied.files.map((f) => f.target).join(', ')}`);
}

const pageDir = path.join(app, 'src', 'app', 'blocks-canary');
fs.mkdirSync(pageDir, { recursive: true });
fs.copyFileSync(path.join(import.meta.dirname, 'blocks-page.tsx'), path.join(pageDir, 'page.tsx'));
routes.push('/blocks-canary');

fs.writeFileSync(path.join(app, '.canary-routes'), `${routes.join('\n')}\n`);
console.log(`routes to load: ${routes.join(' ')}`);
