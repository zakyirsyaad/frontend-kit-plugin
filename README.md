# frontend-kit

A [Claude Code](https://claude.com/claude-code) plugin for systems and dashboard frontends on **Next.js App Router + Tailwind CSS v4 + shadcn/ui (Radix)**. It scaffolds new projects, keeps design tokens consistent, and teaches the agent the project's component rules.

| Component | Invocation | What it does |
|---|---|---|
| `create` | `/frontend-kit:create` | Scaffold a new project: Next.js + shadcn (Radix, `nova`), palette + status tokens, identity layer, self-hosted Geist, Motion (optional GSAP, optional React Three Fiber), project rules, lint + build |
| `theme` | `/frontend-kit:theme` or from context | Switch the base-color palette and the identity layer (accent, radius, display font). Always dry-runs first; asks before writing when it was triggered from conversation |
| `rules` | automatic (or `/frontend-kit:rules`) | Loads the kit's component rules when UI files are touched in a shadcn + Tailwind v4 project |
| `doctor` | `/frontend-kit:doctor` | Read-only diagnosis of any project: kit version, palette drift, custom tokens, fonts, missing route boundaries, duplicate lockfiles |
| `adopt` | `/frontend-kit:adopt` | Bring an existing Next.js + Tailwind v4 project onto the kit: shadcn only when missing, tokens, fonts, rules, route boundaries — one confirmation, then lint and build with the project's package manager |
| `upgrade` | `/frontend-kit:upgrade` | Move a kit project to the installed plugin version: rules block, new tokens, missing boundaries. Never changes the look |
| `effects` | `/frontend-kit:effects` or from context | Add a Magic UI / Aceternity effect: inspect it, install it from its own registry, then adapt it to kit tokens and reduced motion after showing the diff. Asks before installing |
| `blocks` | `/frontend-kit:blocks` | Copy a ready-made block into the project — dashboard shell, data table, chart card, state panel, form, landing sections — with the shadcn components and packages it needs, then lint, build and open its route |
| `frontend-reviewer` | agent | Read-only review against the kit rules plus AI-slop signals; run on request, after UI changes, and in the verification phase of `create` and `adopt` |

## Example

[agency-web-beige.vercel.app](https://agency-web-beige.vercel.app/) is an agency landing page built with frontend-kit from a single one-shot prompt.


## Requirements

- Claude Code with plugin support (verified with 2.1.267)
- Node.js >= 20 for the bundled scripts (verified on 24)
- [Bun](https://bun.sh) for `create` (verified 1.3.14); `theme`/`doctor` use the project's own package manager
- Network access to npm and `ui.shadcn.com` while scaffolding

## Install

```bash
claude plugin marketplace add zakyirsyaad/frontend-kit-plugin
claude plugin install frontend-kit@frontend-kit
```

In-app equivalents: `/plugin marketplace add zakyirsyaad/frontend-kit-plugin`, then `/plugin install frontend-kit@frontend-kit`. Update with `claude plugin marketplace update frontend-kit && claude plugin update frontend-kit@frontend-kit`.


## Usage

### create

```
/frontend-kit:create [project-name] [motion|gsap] [3d|no-3d] [palette] [accent=<preset|#hex>] [radius=<sharp|default|soft|pill>] [display=<font>]
```

Without arguments it asks once for the missing options. Example: `/frontend-kit:create ops-dashboard gsap no-3d stone accent=orange radius=sharp`.

Each phase verifies its real result rather than the exit code, because some CLI prompts exit 0 without doing anything when stdin is closed. A partially created project can be resumed by running the command again.

### theme

```
/frontend-kit:theme [palette] [accent=<preset|#hex|none>] [radius=<...>] [display=<font|none>] [--keep token,token] [--force]
```

Also triggers from conversation ("ganti palet ke slate", "aksen oranye", "terlalu mirip template"). When it was not asked for explicitly it shows the dry-run and waits for confirmation. Tokens you customised by hand are skipped unless you pass `--force`.

### doctor

```
/frontend-kit:doctor [project-dir]
```

Writes nothing. Works on any Next.js project, including ones the kit has never touched.

### adopt

```
/frontend-kit:adopt [project-dir] [palette] [accent=…] [radius=…] [display=…] [--rules-only]
```

Preflight is read-only and stops with a reason when the project is out of scope (Tailwind v3, Pages Router only, a monorepo, or a stylesheet that is not in shadcn v4 shape). Everything else happens after one confirmation that lists what will change, including which tokens `shadcn init` would overwrite.

`shadcn init` on an existing project overwrites `lib/utils.ts`, injects a Google font into `layout.tsx`, and replaces same-named tokens while keeping their comments. adopt repairs all three against the git baseline, which is why it asks you to commit first.

Projects already on shadcn — including Base UI — are never re-inited or migrated to Radix.

### upgrade

```
/frontend-kit:upgrade [project-dir]
```

Refreshes the rules block, adds tokens introduced since, copies missing boundary files, and updates `.frontend-kit.json`. Shows the diff and asks once. It passes your palette and identity through unchanged.

### blocks

```
/frontend-kit:blocks [block] [project-dir]
```

| Block | What you get | Needs |
|---|---|---|
| `dashboard-shell` | `/dashboard` route: collapsible sidebar, header titled from the nav, user menu, `loading.tsx` | `sidebar`, `tooltip`, `avatar`, `dropdown-menu`, `separator`, `skeleton`, `card` |
| `data-table` | sortable, filterable, paginated table with a labelled status badge | TanStack Table v9, `table`, `badge`, `input`, `select` |
| `chart-card` | area or bar chart in a card, colored by `chart-1..5`, with an empty state | recharts, `chart`, `card` |
| `state-panel` | one empty / loading / error component | `empty` |
| `form` | react-hook-form + zod + shadcn `Field`, inline errors, pending submit | react-hook-form, zod, `@hookform/resolvers` |
| `landing-sections` | hero, bento grid, FAQ, CTA and a page composing them | `accordion`, `button` |

The plan comes from `node "${CLAUDE_PLUGIN_ROOT}/scripts/block-plan.mjs" <block> <project-dir>`: missing components and packages, files that would be created or would collide (existing files are never overwritten), and the route to open. The skill asks once, installs with the project's package manager, and verifies by building **and** loading the route — some provider errors only show at runtime. Copied files belong to the project; edit them freely.

### effects

```
/frontend-kit:effects [need or @registry/item] [project-dir]
```

Candidates come from [`catalog/effects.json`](catalog/effects.json): eight needs (hero background, spotlight, logo marquee, metric ticker, CTA shimmer, border highlight, feature bento, card hover) mapped to Magic UI and Aceternity items, with each item's known problems. The skill then:

1. **inspects** the item without installing it (`scripts/inspect-registry-item.mjs`): files, packages, CSS it adds, raw colors, motion without reduced-motion handling, a missing `"use client"`, extra icon libraries, animation classes without keyframes, risky code (blocks the install), and the license;
2. asks once, then **installs** it from the owner's registry with `shadcn add`;
3. **adapts** the copy (`scripts/adapt-registry-item.mjs`) after showing the diff: neutral palette classes to tokens, hex to `var(--chart-*)`, reduced motion by kind of effect, `"use client"`, Tabler/Radix icons to Lucide. Anything without one safe answer is listed, not guessed;
4. records the item in `.frontend-kit.json` (`registryItems[]` with source and adapted hashes), then reviews, lints, builds and loads the page.

`/frontend-kit:doctor` then reports each recorded item as `adapted`, `edited` (changed by hand since) or `missing`, without going online. `/frontend-kit:upgrade` also asks the registries whether an item changed upstream, and offers a reinstall. When the local copy was edited, it warns that a reinstall would discard those edits.

**Effects budget** (in the project rules and checked by the reviewer): one ambient background per page, no decorative effects on dashboard or app routes except a number ticker, and every effect respects reduced motion.

The kit ships no Magic UI or Aceternity code. Installed items are yours under their source license: Magic UI is MIT; Aceternity's published terms forbid redistributing its source, so check them before commercial use.

### Reviewing code

The `frontend-reviewer` agent reports; it never edits. Run the scanner yourself with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/review-scan.mjs" <project-dir> --all
```

It reports kit-rule violations, AI-slop signals and risky third-party registry code as `file:line` with a fix. React correctness, accessibility depth and aesthetic judgement are delegated — see "Works with".

## Design tokens

Nine shadcn base-color palettes: `neutral`, `zinc` (default), `stone`, `gray`, `slate`, `mauve`, `olive`, `mist`, `taupe`. Values come from `ui.shadcn.com/r/colors/<name>.json` and are stored under `scripts/palettes/`.

| Role | Dark (default) | Light | Utility |
|---|---|---|---|
| Page ground | palette 950 | white | `bg-background` |
| Card / popover | palette 900 | white | `bg-card` |
| Elevated / muted | palette 800 | palette 100 | `bg-secondary` / `bg-muted` |
| Border / input | white 10% / 15% | palette 200 | `border-border` |
| Primary action | palette 200 (or accent) | palette 900 (or accent) | `bg-primary` |
| Secondary text | palette 400 | palette 500 | `text-muted-foreground` |
| Status live | green-500 | green-600 | `bg-status-live` |
| Status warning | amber-500 | amber-600 | `bg-status-warning` |
| Status error | red-400 (= `destructive`) | red-600 (= `destructive`) | `bg-status-error` |

**Identity layer** — the reason a kit project does not look like a stock shadcn template:

- **Accent** presets `blue`, `emerald`, `orange`, `rose`, `amber`, `teal`, `violet`, `indigo`, or any `#hex`. It drives `--primary`, `--ring`, `--chart-1` and the sidebar equivalents; the foreground is chosen automatically for at least 4.5:1 contrast. `violet`/`indigo` produce a warning because they read as the generic AI palette.
- **Radius** `sharp` (0.25rem), `default` (0.625rem), `soft` (1rem), `pill`.
- **Display font**, self-hosted through `@fontsource-variable/<name>` and wired to `--font-heading`. No Google Fonts request at build or dev time.

Status tokens never change with the palette or the accent.

## Configuration

Defaults, in priority order:

1. Command arguments.
2. `.claude/frontend-kit.local.md` in the project (YAML frontmatter, gitignored).
3. Plugin settings (`userConfig`): `default_palette`, `default_accent`, `default_radius`, `default_display_font`, `package_manager`, `animation`. They reach the scripts as `CLAUDE_PLUGIN_OPTION_*`.
4. Built-in defaults (zinc, no accent, default radius, no display font, bun, motion).

`/plugin configure` is not available in the desktop Code tab; set the values with `claude plugin install ... --config KEY=VALUE` from a terminal, or use the per-project file.

Each project the kit touches gets a committed `.frontend-kit.json` (kit version, palette, accent, radius, display font, animation, 3D, package manager) and rules between versioned markers in `AGENTS.md`.

## Works with

- **[Vercel plugin](https://github.com/vercel/vercel-plugin)** — general Next.js, React and shadcn guidance. Note: its `shadcn` skill says to always use `shadcn init -d`; in shadcn 4.x that selects Base UI, so this kit overrides it with `-b radix -p nova`.
- **[taste-skill](https://github.com/leonxlnx/taste-skill)** — design direction for landing and marketing pages, plus GSAP scroll recipes. Complements the kit, which targets dashboards.
- **[Impeccable](https://github.com/pbakaus/impeccable)** — design audit and polish (`/impeccable audit`, `critique`). After `create`, `/impeccable document` records the kit tokens in `DESIGN.md`.
- **ECC** — if the ECC hooks are enabled, `design-quality-check` warns about `font-sans` and similar utilities; those warnings are expected for kit tokens. The kit never edits `eslint.config.*`, which ECC's `config-protection` hook blocks.
- Further reading: [awesome-design-systems](https://github.com/alexpate/awesome-design-systems).

Not recommended alongside the kit: `ui-ux-pro-max` (it proposes its own palettes, fonts and a second source of truth).

## Migrating from the `create-systems-frontend` skill

1. Install the plugin as above.
2. Delete the old personal skill directory `~/.claude/skills/create-systems-frontend` — the plugin replaces it.
3. In projects created by the old skill, the rules block in `AGENTS.md` has no version markers; `0.2.0` will rewrite it through `/frontend-kit:adopt --rules-only`.

## Privacy

The plugin collects no telemetry and sends nothing anywhere. Commands it runs on your behalf contact: **npm** (package installs), **ui.shadcn.com** (component registry and palettes), and the **Aceternity/Magic UI registries** only when you ask for one of their components. Self-hosted Geist means no request to Google Fonts. Next.js has its own telemetry, enabled by default; disable it with `NEXT_TELEMETRY_DISABLED=1`.

## Repository layout

```
skills/<name>/SKILL.md                        one folder per skill in the table above
scripts/apply-theme-tokens.mjs                palette, status tokens, identity layer, font wiring
scripts/detect-project.mjs                    read-only preflight; every skill checks its result
scripts/write-rules.mjs                       composes and updates the rules block in AGENTS.md
scripts/copy-templates.mjs                    non-destructive template copies
scripts/block-plan.mjs                        read-only plan for a block: what is missing, what would collide
scripts/inspect-registry-item.mjs             read-only report on a Magic UI / Aceternity item before it is installed
scripts/adapt-registry-item.mjs               rewrites an installed item to kit tokens, reduced motion, Lucide; records it
scripts/check-registry-items.mjs              recorded effects: edited by hand? changed upstream (--live)?
scripts/review-scan.mjs                       deterministic, read-only rule and slop checks
scripts/bump-version.mjs                      keeps both manifests and CHANGELOG on one version
scripts/refresh-palettes.mjs                  re-downloads or checks the palette snapshots
scripts/check-catalog.mjs                     weekly drift: catalog items still exist and still match their fixtures
agents/frontend-reviewer.md                   read-only reviewer
templates/boundaries/                         error, global-error, loading, not-found
templates/blocks/<name>/                      block files plus block.json (shadcn components, npm packages)
evals/                                        skill-triggering eval cases with graders
scripts/palettes/*.json                       the nine shadcn base-color snapshots
rules/{core,gsap,3d}.md                       rules written into the project, per chosen option
templates/3d/                                 lazy-loaded React Three Fiber starter
tests/                                        offline unit tests and the e2e log
```

Every script that writes supports `--dry-run` and `--json`, and exits 0 (ok), 1 (fixable) or 2 (unsupported project).

## Development

```bash
node --test "tests/**/*.test.mjs"     # offline unit tests
claude plugin validate . --strict     # manifests, skills, agents
node scripts/refresh-palettes.mjs --check   # palette drift against ui.shadcn.com
node scripts/check-catalog.mjs         # effects catalog vs the live Magic UI / Aceternity registries
claude --plugin-dir "$PWD"            # load this checkout as a plugin
```

Weekly CI: `canary` scaffolds with the latest create-next-app@16 and shadcn@4 minors, then installs all six blocks, lints, builds and loads their routes; `drift` checks the palette snapshots and the effects catalog. Either opens an issue when it fails.

Release: `node scripts/bump-version.mjs <version>`, update `CHANGELOG.md`, then `claude plugin tag . --dry-run` and `--push`.

Contribution rules are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE). See [`NOTICE`](NOTICE) for third-party attributions.
