---
name: blocks
description: Add a ready-made UI block to a frontend-kit project — dashboard-shell, data-table, chart-card, state-panel, form, or landing-sections. Installs the shadcn components and npm packages the block needs, copies it in without overwriting, then lints, builds, opens its route and runs the kit review. Asks once before writing.
argument-hint: "[block] [project-dir]"
disable-model-invocation: true
allowed-tools:
  - Bash(node *)
  - Bash(git *)
  - Bash(bun *)
  - Bash(bunx *)
  - Bash(npm *)
  - Bash(npx *)
  - Bash(pnpm *)
  - Bash(yarn *)
  - Read
  - AskUserQuestion
license: MIT
metadata:
  author: Zaky Irsyad Rais
---

# Add a block

A block is code the kit owns and the project then keeps: it is copied in, not installed as a dependency. After copying, the files belong to the project and can be edited freely.

## Phase 0 — Which block, which project?

With no block named, list them and ask which one (one `AskUserQuestion`, the six blocks as options):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/block-plan.mjs" --list
```

Then build the plan. It is read-only:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/block-plan.mjs" BLOCK "PROJECT_DIR" --json
```

Stop without writing when `stops` is non-empty, and pass the message on:

| Code | Say |
|---|---|
| `UNKNOWN_BLOCK` | list `available` |
| `NO_SHADCN` | run `/frontend-kit:adopt` first (or `/frontend-kit:create` for a new app) |
| `TAILWIND_V3` | upgrade Tailwind first; the blocks use v4 tokens |
| `NO_APP_DIR`, `MONOREPO`, others | same wording as `/frontend-kit:adopt` Phase 0 |

When `nothingToDo` is true, say the block is already installed and stop.

## Phase 1 — One confirmation

Show the plan in plain words:

- shadcn components to add (`shadcn.missing`) and npm packages to add (`dependencies.missing`);
- files to be created (`files[].status === "create"`), and any `conflict` files, which will be **skipped** rather than overwritten;
- every entry in `warnings` (Base UI project, installed major version different from the block's, conflicts);
- where the block lands, and the route to open afterwards (`verify.routes`), if it has one.

Then ask once with `AskUserQuestion`: Add block / Cancel. If `git status --porcelain` is not empty, say so in the question and recommend committing first so the change is easy to review. Cancel means nothing was written: `git status` must look exactly as before.

## Phase 2 — Install

Run only the commands that are not `null`, in this order, from the project directory:

1. `commands.shadcnAdd` — add `</dev/null` so a prompt cannot hang; then check that each component now exists in the ui folder (a closed prompt exits 0 without installing anything).
2. `commands.addDependencies`.
3. `commands.copy`. It never overwrites; a skipped file is reported, not an error.

Never edit `eslint.config.*`, and never re-run `shadcn init`.

## Phase 3 — Verify

1. `commands.lint` and `commands.build`, if present. A lint error in a file the block did not create (for example `hooks/use-mobile.ts`, which the shadcn `sidebar` ships) is pre-existing shadcn code: report it separately, do not "fix" it as part of the block.
2. **Open the route.** A passing build is not enough — some provider errors only appear at runtime. For each `verify.routes` entry, start the app and load the route (dev server or `start` after the build); a block without a route must be rendered from a page the user chooses before it counts as verified. Look for a clean render and no errors in the server log or console.
3. Review the new files:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/review-scan.mjs" "PROJECT_DIR" FILES...
   ```

   using `verify.reviewFiles`. Expect 0 errors: the templates are tested against this scan.

## Phase 4 — Report

List the components and packages added, the files created or skipped, the lint/build/route results, and the review verdict. Then say where to start editing:

| Block | Start with |
|---|---|
| `dashboard-shell` | `nav-items.ts` (links and header titles) and the user passed in `app/dashboard/layout.tsx` |
| `data-table` | the `Deployment` type and `columns` in `deployments-table.tsx`; statuses in `status-badge.tsx` |
| `chart-card` | pass `data`, `xKey` and up to five `series`; colors follow the palette's `chart-1..5` |
| `form` | `contact-schema.ts` (fields and messages) and the `onSubmit` prop |
| `state-panel` | `kind` plus an optional `action` |
| `landing-sections` | the copy in `landing-page.tsx`; render it from `app/page.tsx` or a marketing route |

For motion on landing sections (a logo marquee, a hero background), suggest `/frontend-kit:effects` rather than hand-adding a third-party component.

Nothing is committed; remind the user to review `git diff` before committing.
