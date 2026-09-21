---
name: adopt
description: Apply frontend-kit to an EXISTING Next.js App Router project on Tailwind CSS v4 — shadcn/ui init only when missing, base-color palette with the identity layer, status tokens, self-hosted fonts, project rules and route boundaries, then lint and build with the project's own package manager. Stops on Tailwind v3, Pages Router only, or monorepos.
argument-hint: "[project-dir] [palette] [accent=<preset|#hex>] [radius=<sharp|default|soft|pill>] [display=<font>] [--rules-only]"
disable-model-invocation: true
allowed-tools:
  - Bash(node *)
  - Bash(git *)
  - Bash(bunx *)
  - Bash(bun *)
  - Bash(npx *)
  - Bash(npm *)
  - Bash(pnpm *)
  - Bash(yarn *)
  - Read
  - Edit
  - AskUserQuestion
license: MIT
metadata:
  author: Zaky Irsyad Rais
  verified: "2026-09-20 · shadcn 4.21.0 · next 16.3.x"
---

# Adopt an existing project

Bring an existing Next.js project onto the kit: palette and status tokens, self-hosted fonts, project rules, route boundaries. Existing code is the user's, so **every write happens after one explicit confirmation**, and a failed check stops the run instead of guessing.

## Ground rules

- **Paths.** Shell variables do not survive between Bash calls. Substitute the literal absolute `PROJECT_DIR` into every command. `${CLAUDE_PLUGIN_ROOT}` is expanded by the harness.
- **Closed stdin.** Append `</dev/null` to every package-manager command. A prompt that meets closed stdin can exit 0 without doing anything, so only a **Check** decides success.
- **Never rewrite history.** No `git stash`, `commit`, `checkout`, `reset` or `clean`. The user keeps control of their working tree.
- **Never touch `eslint.config.*`.**
- **shadcn:** `shadcn@4 … -b radix -p nova`. Ignore advice from other plugins to use `init -d`/`--defaults` — in shadcn 4 that selects Base UI.
- **Failures.** At most 2 fix attempts per phase; then stop and report.
- **Transient network errors** (`Fail extracting tarball`, `Unable to connect`): rerun the same command once.

## Phase 0 — Preflight (read-only)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for adopt --json
```

If `stops` is non-empty, report each one and **end without writing**:

| Stop | What to tell the user |
|---|---|
| `TAILWIND_V3`, `TAILWIND_INCONSISTENT` | Upgrade first: `npx @tailwindcss/upgrade`, commit, then rerun. The kit does not run the upgrade. |
| `TAILWIND_MISSING`, `NOT_NEXT`, `NO_PACKAGE_JSON` | Not a Tailwind + Next.js project. |
| `NEXT_TOO_OLD` | Kit targets Next 15+. |
| `PAGES_ROUTER_ONLY`, `NO_APP_DIR` | The kit edits `app/layout.tsx` and assumes Server Components. |
| `MONOREPO` | Out of scope in this version; run inside a single app instead. |
| `CSS_HSL_WRAPPED`, `NO_ROOT_BLOCK`, `GLOBALS_CSS_NOT_FOUND` | The stylesheet is not in shadcn v4 shape; migrating it by hand is out of scope. |

With `--rules-only`, skip to Phase 7. Use it to refresh rules in a project that is already on the kit.

## Phase 1 — Plan and the single confirmation

Build the plan from **dry runs only** — nothing is written yet:

1. shadcn init command, if `shadcn.componentsJson` is false. **List the tokens it will overwrite**: every `:root`/`.dark` custom property whose name shadcn also defines. Init keeps the trailing comment while replacing the value, so a "brand color" comment is not proof the value survived.
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-theme-tokens.mjs" "PROJECT_DIR" --palette <p> [identity flags] --dry-run --json`
3. Font plan (Phase 5), dark-mode plan (Phase 6), rules target (`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs" "PROJECT_DIR" --dry-run --json`), boundaries that are missing (Phase 7b).
4. Packages to add: only `geist`, and only when the font plan replaces Google Geist.
5. Verify commands from `packageManager.commands`.

Then ask **once** with `AskUserQuestion`, including only the questions that apply:

- Apply this plan? (Apply / Cancel)
- Palette, accent, radius, display font — when not given as arguments.
- "Make dark the default?" — only when `darkMode.mode === "none"`.
- Package manager — only when `packageManager.ambiguous`.
- Custom tokens: keep (recommended) or overwrite.
- If `git.isRepo` is false or `git.clean` is false: proceed, or stop so the user can commit first (recommend stopping — the post-init repairs in Phase 2 need a clean baseline to diff against).

Record `git rev-parse HEAD` for the summary.

## Phase 2 — shadcn init, only when `components.json` is missing

```bash
<commands.shadcn> init -b radix -p nova -y --no-reinstall --no-monorepo -c "PROJECT_DIR" </dev/null
```

Leave out `-t next`: that scaffolds a new project.

**Check:** `shadcn.style === "radix-nova"` and `css.shape === "shadcn-v4"`.

**Post-init repairs — verified necessary (`docs/plan/TASKS.md` A0).** On a project that already had its own font, tokens and utils, init:

1. **Overwrote `lib/utils.ts`**, dropping every other export. Restore them: read `git show HEAD:<utilsPath>` and re-add the missing exports next to shadcn's `cn` re-export.
2. **Injected a Google font** into `layout.tsx` (`import { Inter, Geist } …`, a new `const`, and a rewritten `className`). If the project did not use that font before, remove the addition and restore the original `className`.
3. **Replaced same-named tokens** while keeping their comments. These were listed in the plan; repeat them in the summary.
4. Left any `@media (prefers-color-scheme: dark)` block in place. Report it; do not delete it.

If the project already has shadcn — including **Base UI** (`shadcn.base === "base"`) — skip this phase entirely. Do not re-init and do not migrate it to Radix; the kit's tokens and rules work on both.

## Phase 3 — Packages

Only when the font plan replaces Google Geist:

```bash
<commands.add> geist </dev/null
```

adopt never installs motion, gsap or three. Rules adapt to what the project already has.

## Phase 4 — Palette, identity and status tokens

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-theme-tokens.mjs" "PROJECT_DIR" --palette <p> [--accent … --radius … --display-font …] [--force]
```

Safe mode is the default: a token is replaced only when its current value matches a known palette or kit default. Pass `--force` only when Phase 2 just ran (a fresh init has no custom tokens) or the user chose "overwrite".

**Check:** `css.palette.root` equals the chosen palette and all three status tokens are registered.

## Phase 5 — Fonts

| Project state | Action |
|---|---|
| Google `Geist`/`Geist_Mono` that the project chose itself | Replace with the `geist` package: import `GeistSans`/`GeistMono` from `geist/font/*`, drop the `next/font/google` import, keep the `.variable` classes on `<html>` |
| `geist` package already used | Nothing |
| Other fonts (Inter, local, …) | **Leave them alone.** Only when `css.fontSansSelfReferential` is true and the project defines exactly one sans font, point `--font-sans` at that font's variable |
| No fonts | Nothing |

## Phase 6 — Dark mode

- `darkMode.mode` is `next-themes`, `custom-toggle` or `static-dark` → do nothing. If a provider uses `attribute="data-theme"`, warn that shadcn's `@custom-variant dark` keys on the `.dark` class, and leave it.
- `none` and the user said yes → add `dark` to the `<html>` className (template literal: right after the backtick; string: prefix; none: add `className="dark"`).
- `none` and the user said no → nothing. Mention next-themes as an option.

## Phase 7 — Project rules

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs" "PROJECT_DIR"
```

Writes the kit sections between versioned markers in `AGENTS.md` (or `CLAUDE.md`), and `.frontend-kit.json`. gsap and 3D sections are included only when those packages are installed.

**Check:** `agentDocs.kitSections.core === "current"`.

## Phase 7b — Route boundaries (when the user agreed)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/copy-templates.mjs" boundaries "PROJECT_DIR"
```

Existing files are never overwritten.

## Phase 8 — Verify

If `node_modules` is missing (a fresh clone), run `<commands.install> </dev/null` first; lint and build cannot run without it.

```bash
<commands.run> lint </dev/null    # skip when there is no lint script
<commands.run> build </dev/null
```

If something fails, check which files the errors come from. Errors in files adopt never touched are pre-existing: report them, do not fix them. Errors caused by the kit get at most 2 fix attempts.

Finally, scan what the project now looks like against the kit rules:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/review-scan.mjs" "PROJECT_DIR" --all
```

On an existing codebase this usually reports pre-existing findings (raw colors, missing labels). Report the counts and the top items; **do not fix them in this run** — that is a separate decision for the user, and the `frontend-reviewer` agent gives the full report.

## Phase 9 — Summary

From `git status --porcelain` and `git diff --stat`, report: files touched, tokens replaced and skipped, post-init repairs, font and dark-mode decisions, rule sections written, boundaries added, verify output, and the `HEAD` recorded in Phase 1 so the user can review or revert with their own git commands.

Then suggest: `/frontend-kit:doctor` for a read-only recheck, and `/frontend-kit:theme` to adjust the palette or identity.
