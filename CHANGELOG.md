# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-09-21

Fixes found by running the kit on a real project, and weekly checks for the
parts of the kit that depend on code it does not own.

### Fixed

- `detect-project` read a declared range without a dot (`"^4"`, `"^3"`) as an
  unknown version whenever `node_modules` was absent, so a freshly cloned
  Tailwind v3 app slipped past the `TAILWIND_V3` stop in `adopt` and `blocks`.
- `theme` safe mode compared tokens against all nine palettes at once, so a
  brand color that happened to equal another palette's value counted as
  unmodified and was replaced. Only the palette the stylesheet is actually on
  now counts; kit-owned status and radius values stay replaceable.
- Blocks broke the build in projects whose shadcn icon library is not Lucide:
  `block-plan` now adds `lucide-react` when a block needs it and warns that it
  brings a second icon set.
- `adopt` installs dependencies before verifying when `node_modules` is missing.

### Added

- `canary` installs all six blocks into the scaffolded app, then reviews, lints,
  builds and loads each route.
- `drift` runs the new `scripts/check-catalog.mjs`: every effects catalog item
  must still exist in its registry, and items with a fixture must still report
  the same inspection issues. Both workflows open an issue when they fail.
- Catalog note: `@magicui/dot-pattern` imports `motion` without declaring it.

### Project upgrade

Rules, tokens and templates are unchanged. `/frontend-kit:doctor` will show the
rules marker as outdated until `/frontend-kit:upgrade` moves it to `v0.3.1`.
Projects adopted with 0.3.0 whose stylesheet has its own brand colors should
check that none was replaced (`git diff` of `globals.css` from that run).

## [0.3.0] - 2026-09-21

Blocks you copy in, and Magic UI / Aceternity effects installed from their own
registries and adapted to the kit.

### Added

- Skill `blocks` plus `scripts/block-plan.mjs`: six token-only blocks —
  `dashboard-shell` (a working `/dashboard` route with sidebar, header, user
  menu and `loading.tsx`), `data-table` (TanStack Table v9, sorting, filters,
  pagination, labelled status badges), `chart-card` (`chart-1..5`, empty
  state), `state-panel`, `form` (react-hook-form + zod + `Field`) and
  `landing-sections` (hero, asymmetric bento, FAQ, CTA). The planner lists the
  missing shadcn components and packages, files that would collide (never
  overwritten), stop codes and the route to open; verification loads that route,
  not just the build.
- Skill `effects`: catalog → inspect → one confirmation → `shadcn add` from the
  owner's registry → adapt after showing the diff → review, lint, build, load.
  - `catalog/effects.json`: eight needs mapped to Magic UI and Aceternity items
    with their known problems (names and notes only, no code).
  - `scripts/inspect-registry-item.mjs`: read-only report on files, packages,
    CSS, raw colors, motion without reduced-motion handling, missing
    `"use client"`, undeclared or unused packages, extra icon libraries,
    `animate-*` without keyframes, risky code (blocks the install), license.
  - `scripts/adapt-registry-item.mjs`: neutral palette classes → tokens, hex →
    `var(--chart-*)`, reduced motion by kind of effect (ambient backgrounds are
    hidden by CSS, everything else keeps its content under `MotionConfig`),
    `"use client"`, Tabler/Radix icons → Lucide. Idempotent; records the item in
    `.frontend-kit.json` `registryItems[]` with source and adapted hashes.
- Effects budget in the project rules and in `review-scan`
  (`effect-budget-ambient`, `effect-in-dashboard`).
- `doctor` reports recorded effects as `adapted`, `edited` or `missing`;
  `upgrade` checks them against the registries (`check-registry-items.mjs
  --live`) and warns before a reinstall would discard hand edits.
- Eval cases for `effects` asking before install, declining dashboard
  decoration, and `blocks` staying manual.

### Fixed

- Every `--dry-run` diff marked all lines after an insertion as changed; diffs
  are now LCS-based hunks with context.
- `doctorReport.pluginVersion` and the report `kitVersion` were still the
  literal `0.1.0`.
- `review-scan` reported `cn("…")` class lists twice, missed `w-N h-N` at the
  end of a quoted class list, and did not count `@radix-ui/react-icons` as an
  icon library.
- The README coverage test now derives skills and scripts from the tree.

### Project upgrade

Run `/frontend-kit:upgrade` to refresh the rules block to `v0.3.0` (it adds the
effects budget and points registry components at `/frontend-kit:effects`).
Blocks and effects are opt-in: nothing is added to a project until you run
`/frontend-kit:blocks` or `/frontend-kit:effects`.

## [0.2.0] - 2026-09-20

Existing projects, and a reviewer that checks code against the kit's own rules.

### Added

- Skill `adopt`: brings an existing Next.js + Tailwind v4 project onto the kit.
  One confirmation before any write, stop codes for Tailwind v3, Pages Router,
  monorepos and non-shadcn stylesheets, and repairs for the three things
  `shadcn init` breaks on an existing project (see Fixed).
- Skill `upgrade`: refreshes the rules block, adds tokens introduced since, and
  updates `.frontend-kit.json` — always after a dry run, never changing the look.
- Agent `frontend-reviewer` plus `scripts/review-scan.mjs`: deterministic,
  read-only checks for kit rules, AI-slop signals (gradient text, default
  purple, mixed radius scales and icon sets, nested cards, emoji as icons) and
  third-party registry code. `create` and `adopt` run it in verification.
- Route boundary templates (`error`, `global-error`, `loading`, `not-found`)
  written against kit tokens, copied by `create` and offered by `adopt`.
- Eleven eval cases with graders, plus a contract test that fails when an eval
  no longer maps to a rule in the plugin.
- Weekly `canary` workflow (scaffolds against the latest create-next-app and
  shadcn minors and opens an issue when they break the kit) and `drift`
  workflow (palette snapshots vs ui.shadcn.com). `compat.json` records the
  versions actually verified.

### Fixed

- `createChecks.layout` accepted the Google font a fresh create-next-app ships,
  so a resumed run skipped dark mode and self-hosted fonts.
- `.frontend-kit.json` never carried `kitVersion` and was only written when the
  css changed, leaving `doctor` and `upgrade` with nothing to compare.
- An accented project reported its palette as `custom`, because the seven
  accent-owned tokens dragged the match below the threshold.
- Every standard pnpm project was refused as a monorepo: create-next-app always
  writes `pnpm-workspace.yaml`, which for a single app only carries
  `allowBuilds:`.
- Backups of files outside the project produced an invalid path on Windows and
  escaped the backup folder on POSIX.
- `detect-project` and `write-rules` hardcoded the plugin version, so after a
  bump, up-to-date projects read as outdated and new markers carried the old
  number. Tests now reject a hardcoded version anywhere in `scripts/`.

### Project upgrade

Run `/frontend-kit:upgrade` in each kit project: it refreshes the rules block to
`v0.2.0`, adds any missing status tokens and boundary files, and records the new
`kitVersion`. It never changes your palette, accent, radius or fonts — use
`/frontend-kit:theme` for that.

Projects created by the old `create-systems-frontend` skill should run
`/frontend-kit:adopt --rules-only` first: their rules block predates the version
markers.

## [0.1.0]

First release as a plugin. It replaces the personal `create-systems-frontend`
skill; see "Project upgrade" below.

### Added

- Plugin manifest and same-repo marketplace (`source: "./"`), installed as
  `frontend-kit@frontend-kit`.
- Skill `create`: scaffolds Next.js App Router + Tailwind v4 + shadcn/ui
  (Radix, `nova` preset) with self-hosted Geist, Motion, optional GSAP and
  optional lazy React Three Fiber, then lint and build. Every phase verifies its
  real result, so a prompt that exits 0 without doing anything is caught.
- Skill `theme`: nine shadcn base-color palettes plus an identity layer — one
  accent (eight presets or any hex, foreground picked for >= 4.5:1 contrast),
  a radius scale, and a self-hosted display font. Dry-run first; confirmation
  required when the skill was triggered from conversation rather than asked for.
- Skill `rules`: three-layer trigger (paths, description, deterministic gate) so
  the kit's component rules load only in shadcn + Tailwind v4 projects.
- Skill `doctor`: read-only diagnosis of any Next.js project.
- Scripts (Node ESM, no dependencies): `apply-theme-tokens`, `detect-project`,
  `write-rules`, `copy-templates`, `bump-version`, `refresh-palettes`, plus
  `scripts/palettes/*.json` for the nine palettes.
- Per-project state in `.frontend-kit.json` and versioned rule markers in
  `AGENTS.md`, so rules can be updated later instead of only appended.
- User configuration: `default_palette`, `default_accent`, `default_radius`,
  `default_display_font`, `package_manager`, `animation`, resolved as
  arguments → `.claude/frontend-kit.local.md` → plugin settings → defaults.
- Status tokens `--status-live`, `--status-warning`, `--status-error`,
  registered in `@theme inline` and constant across palettes and accents.
- 80 offline unit tests and CI on Ubuntu, macOS and Windows.
- Documentation: README, `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`.

### Changed

- Fonts are self-hosted through the `geist` package instead of
  `next/font/google`. A flaky network used to break the build and leave the dev
  server returning 500.
- Theme tokens are patched into the file shadcn generates rather than
  overwriting `globals.css`, so imports, `@theme inline` and the radius scale
  survive. The script is idempotent and refuses to guess on unexpected shapes.
- Project rules are split per option (`core`, `gsap`, `3d`); a project only
  receives the sections that match what it installed.

### Fixed

- Tokens are written as `oklch()` for Tailwind v4 instead of the v3 HSL triplets
  the old skill produced, which yielded invalid colors.
- `shadcn init` now runs with `-b radix -p nova`, so the Radix base is used;
  `-d` selects Base UI.
- `layout.tsx` gets the `dark` class and a working font variable — shadcn
  reports "Updating fonts" but leaves the file untouched.
- Documented test command is `node --test "tests/**/*.test.mjs"`; on Node 24,
  `node --test tests/` treats the directory as a module and fails.

### Project upgrade

New projects: nothing to do.

Projects created by the old `create-systems-frontend` skill keep working. Their
`AGENTS.md` rules block has no version markers and still points at a path inside
`~/.claude/skills/`. Version 0.2.0 rewrites it through
`/frontend-kit:adopt --rules-only`. Until then you can run `/frontend-kit:doctor`
for a read-only report.

After installing the plugin, delete the old skill directory
`~/.claude/skills/create-systems-frontend` so the command is not offered twice.
