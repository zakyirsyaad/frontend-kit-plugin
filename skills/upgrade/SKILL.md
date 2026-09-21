---
name: upgrade
description: Bring a project that already uses frontend-kit up to the installed plugin version — refresh the rules block in AGENTS.md, add tokens introduced since, copy new route-boundary templates, and update .frontend-kit.json. Shows a dry-run diff and asks once before writing. Use when doctor reports the project is behind, or after updating the plugin.
argument-hint: "[project-dir]"
disable-model-invocation: true
allowed-tools:
  - Bash(node *)
  - Bash(git *)
  - Read
  - AskUserQuestion
license: MIT
metadata:
  author: Zaky Irsyad Rais
---

# Upgrade a kit project

The plugin moves; projects do not. This brings one project up to the version of the plugin that is installed right now.

## Phase 0 — Where is the project?

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for doctor --json
```

Read from the report:

| Field | Meaning |
|---|---|
| `kitState.kitVersion` / `doctorReport.kitVersionInProject` | version the project was last touched with (`null` = never, or written before `0.2.0`) |
| `agentDocs.kitSections` | `current`, `outdated`, `legacy` (pre-marker block) or `absent`, per section |
| `css.statusTokens.registered` | which `--color-status-*` the stylesheet exposes |
| `css.palette` / `kitState.accent` | what to preserve, not what to change |

Stop and say so when:

- `stops` is non-empty → same table as `/frontend-kit:adopt` Phase 0.
- `kitSections.core === "absent"` and `kitState` is empty → this project never used the kit. Point at `/frontend-kit:adopt` instead.
- Everything is already `current`, the status tokens are all registered, and `kitVersion` matches the plugin → report "already up to date" and stop.

## Phase 0b — Registry effects

When `doctorReport.registryItems` is not empty, check them against their registries:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-registry-items.mjs" "PROJECT_DIR" --live --json
```

This contacts the registries (one `shadcn view` per item) and writes nothing. Per item, `action` says what to offer:

| `action` | Offer |
|---|---|
| `none` | nothing; the item is current |
| `reinstall` | reinstall and re-adapt: the registry changed and the local copy has no hand edits, or a file is missing |
| `reinstall-discards-edits` | the registry changed **and** the local copy was edited by hand. Say that a reinstall discards those edits and recommend leaving it unless the user wants the upstream change |

Reinstalling is the effects flow from Phase 3 on: `<shadcn> add ITEM -y --overwrite </dev/null`, then `adapt-registry-item.mjs ITEM "PROJECT_DIR" --dry-run`, show the diff, apply on yes. Ask per item, inside the Phase 1 confirmation. `upstream: unknown` (registry unreachable) is reported, not retried.

## Phase 1 — Dry run, then one confirmation

Collect the diff without writing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs" "PROJECT_DIR" --dry-run --json
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-theme-tokens.mjs" "PROJECT_DIR" --palette <current palette> [--accent <current>] [--radius <current>] [--display-font <current>] --dry-run --json
node "${CLAUDE_PLUGIN_ROOT}/scripts/copy-templates.mjs" boundaries "PROJECT_DIR" --dry-run
```

Report, in plain words:

- rule sections that will be rewritten, and their old marker version;
- tokens that will be **added** (status tokens introduced since the project's version), and tokens that will be **left alone** because they are customized;
- boundary files that are missing and would be created;
- `kitVersion` moving from X to Y.

**Pass the project's current palette and identity through.** Upgrade never changes the look: if the dry run shows palette or accent values changing, something is wrong — stop and report rather than applying. Use `/frontend-kit:theme` for deliberate visual changes.

Then ask once with `AskUserQuestion`: Apply / Cancel. If the working tree is dirty, say so in the question and recommend committing first.

## Phase 2 — Apply

Run the same three commands without `--dry-run`. `write-rules` replaces only what is between its markers; a legacy block that was edited by hand is skipped with a warning instead of being overwritten.

## Phase 3 — Check

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for doctor --json
```

Expect `kitSections` all `current` (or `absent` for options the project does not use), every status token registered, and `kitVersion` equal to the plugin version. Re-running the upgrade now must report "already up to date" — that is the idempotency check.

## Phase 4 — Report

List what changed, what was skipped and why, and the `git diff --stat`. Remind the user that nothing was committed, and suggest `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-scan.mjs" "PROJECT_DIR" --all` if they want to see how the code now measures against the refreshed rules.
