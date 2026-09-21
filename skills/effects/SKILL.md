---
name: effects
description: Add a Magic UI or Aceternity effect (hero background, spotlight, logo marquee, number ticker, shimmer CTA, border beam, hover cards) to a frontend-kit project. Inspects the item, installs it from its registry, then adapts it to kit tokens and reduced motion after showing the diff. Use when the user asks for a visual effect or animation on a landing page. Always asks before installing.
argument-hint: "[need or @registry/item] [project-dir]"
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

# Add an effect

Effects come from third-party registries. The kit never stores their code: it installs the item from its owner's registry into the user's project, then rewrites the copy to follow the project's rules. The installed files are the user's code, under the item's license.

Nothing is installed without one explicit yes, even when the request came from conversation.

## Phase 0 — Is this a kit project, and where does the effect go?

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for doctor --json
```

Stop when `stops` is non-empty, when there is no `components.json`, or when Tailwind is not v4. Point at `/frontend-kit:adopt` (existing app) or `/frontend-kit:create` (new app).

Find out which page or section the effect is for. If it is a dashboard or app route (sidebar layout, `dashboard/`, `admin/`, `settings/`), say that the kit keeps those screens free of decoration, and offer only the metric ticker there.

## Phase 1 — Find candidates

Read `${CLAUDE_PLUGIN_ROOT}/catalog/effects.json`. Match the request to a `need` (hero background, spotlight, logo marquee, metric ticker, CTA shimmer, border highlight, feature bento, card hover). When a need has a `kitAlternative`, mention it first. If nothing in the catalog fits, search the registries:

```bash
<shadcn> search @magicui @aceternity -q "<keyword>" --json </dev/null
```

`<shadcn>` is `packageManager.commands.shadcn` from Phase 0. Offer at most three candidates with their `fit` and known `issues`. When the user named an exact `@registry/item`, go straight to Phase 2.

## Phase 2 — Inspect, then one confirmation

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/inspect-registry-item.mjs" ITEM "PROJECT_DIR" --json
```

- `verdict: "blocked"` → stop. Show the `block` issues (dynamic code, remote scripts) and suggest another candidate.
- Otherwise report in plain words: the file(s) and where they land, packages and shadcn components added (`dependencies`, `registryDependencies`), what goes into `globals.css` (`css.themeVars`, `css.rules`), every `adapt`/`warn` issue, the license (`license.redistribution`), and the budget note (`effect-budget`).
- `overrides-color-token` means the item would change the palette. Recommend another candidate unless the user wants that.
- If the target page already renders an ambient effect, say that a second one breaks the effects budget.

Ask once with `AskUserQuestion`: Install and adapt / Pick another candidate / Cancel. Cancel after this phase leaves the project untouched: inspection only reads.

## Phase 3 — Install from the registry

From the project directory:

1. `<shadcn> add ITEM -y </dev/null`, then check that every file in the inspection's `files[].destination` now exists (a closed prompt exits 0 without installing).
2. If `dependencies.undeclared` is not empty (the item imports a package it does not declare), install those with `packageManager.commands.add`.

## Phase 4 — Adapt, with the diff first

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/adapt-registry-item.mjs" ITEM "PROJECT_DIR" --dry-run
```

Show the diff and the "left as is" lines, then ask Apply / Keep the original. Apply runs the same command without `--dry-run`. It rewrites only the item's files and records the item in `.frontend-kit.json` (`registryItems[]`, with hashes that `/frontend-kit:doctor` uses to spot later hand edits).

If `removableDependencies` is not empty, ask separately before removing those packages. Never remove one that another file imports.

## Phase 5 — Use it and verify

1. If the user named a page or section, render the effect there, next to the content it decorates. Otherwise show a short usage snippet.
2. Review the item's files and the page:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/review-scan.mjs" "PROJECT_DIR" FILES...
   ```

   Expect no `raw-color-class`, `missing-reduced-motion` or `slop-mixed-icons` on the adapted files, and no `effect-budget-ambient` / `effect-in-dashboard` on the page.
3. Lint and build with the project's package manager, then load the page. Some effects only fail at runtime (a missing provider, an undeclared package).

## Phase 6 — Report

Say what was installed, what the adapter changed (`adaptations`), what it left for a person (`leftovers`, e.g. a number ticker must show its final value under reduced motion), the license of the source, and the files to review before committing. Nothing is committed.
