---
name: theme
description: Switch the shadcn/ui base-color palette or identity layer (accent color, border radius, display font) in a Tailwind CSS v4 + shadcn/ui project. Use when asked to change theme, palette, accent, radius, or fonts, or when colors, branding, or a "too much like a default template" look come up (e.g. "ganti palet ke slate", "aksen oranye", "terlalu mirip template").
argument-hint: "[palette] [accent=<preset|#hex|none>] [radius=<sharp|default|soft|pill>] [display=<font|none>] [project-dir] [--keep token,token] [--force]"
allowed-tools:
  - Bash(node *)
  - Bash(bun *)
  - Bash(pnpm *)
  - Bash(npm *)
  - Bash(yarn *)
  - Read
  - Edit
  - AskUserQuestion
license: MIT
metadata:
  author: Zaky Irsyad Rais
  verified: "2026-09-19 · node 24 · tailwind v4 · shadcn 4"
---

# Theme Skill — frontend-kit

Switch the shadcn/ui base-color palette, accent color, border radius scale, or display font cleanly and safely.

## Ground Rules

1. **Contextual Trigger vs Explicit Request**:
   - **Explicit request** (user specifically mentions `/frontend-kit:theme`, `theme`, or names a specific palette/accent/radius/font like "ganti palet ke slate", "ubah aksen ke orange"): Run preflight and dry-run. If there are no custom tokens to be overwritten and `globals.css` is clean, apply changes directly. If custom tokens would be overwritten or `globals.css` is dirty, ask confirmation first.
   - **Contextual trigger** (user expresses general aesthetic or branding feedback like "tampilannya terlalu mirip template", "samakan dengan warna brand kami", "kurang tajam sudutnya"): The skill **MUST NOT** write changes directly to disk. First run preflight and dry-run, present the proposed changes and diff clearly, and ask for confirmation via `AskUserQuestion` before applying. If user cancels or declines, do not modify any files.
2. **Deterministic Script Execution**:
   - Use `${CLAUDE_PLUGIN_ROOT}` (with fallback `${CLAUDE_SKILL_DIR}/../../`) for all script invocations.
   - Never write or rewrite CSS tokens manually. Always use `scripts/apply-theme-tokens.mjs`.
   - Never touch `eslint.config.*`.
3. **Fail-Fast Preflight**:
   - Always run preflight check first: `node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for theme`.
   - If `stops` contains `TAILWIND_V3`, `SHADCN_MISSING`, or `CSS_HSL_WRAPPED`, report the blocker and exit without making modifications.

---

## Workflow

### Step 1: Resolve Project Directory & Arguments

1. Determine `PROJECT_DIR`:
   - If path is provided in arguments, resolve it.
   - Otherwise, use current working directory (`.`).
2. Parse `$ARGUMENTS`:
   - Palettes: `neutral`, `zinc`, `stone`, `gray`, `slate`, `mauve`, `olive`, `mist`, `taupe`. (Legacy `gray` / `slate` are fully supported).
   - Accent: `accent=<preset|#hex|none>` (presets: `blue`, `emerald`, `orange`, `rose`, `amber`, `teal`, `violet`, `indigo`, or hex `#xxxxxx`, or `none`).
   - Radius: `radius=<sharp|default|soft|pill>`.
   - Display Font: `display=<font|none>` (e.g. `fraunces`, `inter`, `none`).
   - Options: `--force`, `--keep <token1,token2>`.
   - Any value not specified retains its current state recorded in `.frontend-kit.json` or project CSS.

### Step 2: Preflight Inspection

Run project detection for theme:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for theme
```

- Check `stops[]`: If any stop code is present (e.g. `SHADCN_MISSING`, `TAILWIND_V3`), abort immediately and explain why.
- Check current palette, accent, radius, and package manager from the JSON output.

### Step 3: Dry-Run & Diff Inspection

Run dry-run to compute exact changes without touching disk:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-theme-tokens.mjs" "PROJECT_DIR" --palette <palette> [options] --dry-run --json
```

Evaluate the result:
- If `changed === false`: Report to the user that the project already uses the requested configuration ("unchanged"). Do not proceed to write.
- If `skippedCustom` has tokens: Note which custom tokens were preserved (or would be overwritten if `--force`).
- If `warnings` has items (e.g. violet/indigo AI-default advisory): Display warnings to the user.

### Step 4: Confirmation Gate

Determine whether user confirmation is required before applying:
- **Mandatory Confirmation (AskUserQuestion)** if:
  1. Invocation was triggered contextually from conversation (not an explicit `/frontend-kit:theme` or explicit theme change command).
  2. Or `skippedCustom.length > 0` and `--force` is requested.
  3. Or git working tree has unstaged edits in CSS (`globals.css` dirty).
- Present:
  - Summary of proposed changes (Palette, Accent, Radius, Display Font).
  - Unified diff or list of modified tokens.
  - Ask via `AskUserQuestion`: "Terapkan perubahan tema ini ke project?" (Yes / No).
- If the user selects "No" or cancels, stop immediately. Verify no files were modified.

### Step 5: Apply Theme Changes

1. Execute theme application:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-theme-tokens.mjs" "PROJECT_DIR" --palette <palette> [options]
   ```
2. If a new display font package was specified (`display != "none"` and not already installed):
   Install the `@fontsource-variable/<name>` package using detected package manager:
   ```bash
   <package_manager_add> "@fontsource-variable/<name>"
   ```
   And ensure font import is present in `PROJECT_DIR/src/app/layout.tsx` (or `app/layout.tsx`):
   ```tsx
   import "@fontsource-variable/<name>";
   ```
3. Update project rules if marker exists:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs" "PROJECT_DIR"
   ```

### Step 6: Post-Verification & Summary

1. Inspect updated tokens and rules:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs" "PROJECT_DIR" --for theme
   ```
2. If project contains 3D canvas templates (`src/components/systems/systems-3d-canvas.tsx` or `canvas-lazy.tsx`), remind user to review background color or fog constants in the 3D scene if desired.
3. Print clear summary of applied changes:
   - Active palette (e.g. `slate`)
   - Accent color & contrast confirmation (≥ 4.5:1 WCAG AA)
   - Border radius scale
   - Display font family
   - Updated files (`globals.css`, `components.json`, `.frontend-kit.json`, `AGENTS.md`).
