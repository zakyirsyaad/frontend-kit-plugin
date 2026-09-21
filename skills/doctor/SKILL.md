---
name: doctor
description: Inspect the design system health and configuration of a frontend project (kit version, shadcn base, palette, status tokens, fonts, rules markers, route boundaries). Read-only.
argument-hint: "[project-dir]"
disable-model-invocation: true
allowed-tools:
  - Bash(node *)
  - Read
license: MIT
metadata:
  author: Zaky Irsyad Rais
  verified: "2026-09-19 · node 24 · tailwind v4 · shadcn 4"
---

# Doctor — frontend-kit

Inspect design system health, token configuration, rules markers, fonts, and App Router boundaries in a project. This skill is strictly read-only and performs zero filesystem modifications.

## Workflow

### 1. Resolve Project Directory

1. If an argument is supplied in `$ARGUMENTS`, resolve `PROJECT_DIR` to that path.
2. Otherwise, default `PROJECT_DIR` to the current working directory `.`.

### 2. Run Diagnostics

Execute `detect-project.mjs` with `--for doctor --json`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for doctor --json
```

*(If `${CLAUDE_PLUGIN_ROOT}` is unset, fallback to `${CLAUDE_SKILL_DIR}/../../scripts/detect-project.mjs`)*.

### 3. Format Diagnostic Report

Parse the JSON output and render a clear, structured health report using the sections below:

```markdown
# Frontend Kit Doctor Report

**Target:** `<projectDir>`

## 1. Kit & Rules
- **Kit in Project:** `<kitVersionInProject || "Not adopted">` (Plugin: `<pluginVersion>`)
- **Rules Marker:** `<rulesMarker>` (current / outdated / legacy / absent)
- **Config:** `<has .frontend-kit.json? Yes / No>`

## 2. Framework & Stack
- **Next.js:** `<next.declared || "Not detected">` (App Router: `<appDir ? "Yes" : "No">`)
- **Tailwind CSS:** `<tailwind.declared || "Not detected">` (`<tailwind.major || "v4">`)
- **Package Manager:** `<packageManager.name>` (Lockfile: `<packageManager.lockfiles.join(', ')>`)
  *(If multipleLockfiles is non-empty: emit warning: Multiple lockfiles detected: ...)*

## 3. Design System & Components
- **shadcn/ui:** `<shadcnBase || "Not configured">` (Style: `<shadcnStyle || "default">`)
- **Components:** `<installedComponents count>` installed (`<installedComponents list>`)

## 4. Colors & Tokens
- **Base Palette:** `<palette>`
- **Token Format:** `<colorFormat>` (`oklch` / `hsl-bare` / `hsl-wrapped` / `hex`)
- **Status Tokens:**
  - Declared: `<statusTokens.declared.join(', ') || "None">`
  - Registered in CSS: `<statusTokens.registered.join(', ') || "None">`
- **Custom Tokens:** `<customTokensCount>` non-standard tokens detected

## 5. Typography & Fonts
- **Geist Package:** `<fonts.geistPackage ? "Self-hosted (geist)" : "No">`
- **Google Geist:** `<fonts.googleGeist ? "Yes (external network dependency)" : "No">`
- **Other Fonts:** `<fonts.otherFonts.join(', ') || "None">`

## 6. Route Boundaries
- **Missing Boundaries:** `<missingBoundaries.join(', ') || "All standard boundaries present">`

## 7. Registry Effects
<One line per registryItems entry: `<item>` — `<status>` (installed `<installedAt>`)>
- `adapted`: files match what `/frontend-kit:effects` wrote.
- `edited`: changed by hand since it was adapted. Fine if intended; a reinstall from `/frontend-kit:upgrade` would discard those edits.
- `missing`: `<missing.join(', ')>` deleted; reinstall with `/frontend-kit:effects`.
*(Omit this section when registryItems is empty.)*

## 8. Recommended Actions
<List each command from suggestedCommands, with explanation>
- `/frontend-kit:adopt`: Adopt frontend-kit conventions into this existing project.
- `/frontend-kit:theme`: Configure missing status tokens or adjust palettes and accents.
- `/frontend-kit:rules`: Update outdated or absent project rules in AGENTS.md.
- `/frontend-kit:effects`: Reinstall a registry effect whose files are missing.
```

Doctor only reads the recorded hashes. It does not contact the registries; `/frontend-kit:upgrade` does that when asked.

If `suggestedCommands` is empty and rules are current, conclude with:
`Project design system health is optimal. No actions required.`
