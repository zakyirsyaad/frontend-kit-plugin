---
name: rules
description: Component rules for Next.js + Tailwind CSS v4 + shadcn/ui projects — semantic tokens instead of raw colors, shadcn primitives over clickable divs, status colors with text labels, size-N, Motion/GSAP/R3F patterns, self-hosted fonts. Use when editing React components, className, or globals.css in a project with components.json and Tailwind v4. Not for projects without shadcn/ui or on Tailwind v3.
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/globals.css"
  - "components.json"
allowed-tools:
  - Read
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs *)
license: MIT
metadata:
  author: Zaky Irsyad Rais
  verified: "2026-09-19 · node 24 · tailwind v4 · shadcn 4"
---

# Rules — frontend-kit

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs" . --print --gate`

## Truth Hierarchy

1. **Project-level `AGENTS.md` / `CLAUDE.md`**: If the project contains committed `<!-- frontend-kit:core ... -->` rule sections, those committed sections represent the project's canonical design contract and take precedence over default external docs or generic plugin guidelines.
2. **Design Tokens (`globals.css`)**: The single source of truth for palettes, colors, radius, and fonts is `globals.css` as managed by the kit. External design files (`DESIGN.md`, `MASTER.md`) may specify layout and hierarchy, but must map all visual styles to kit tokens. Never edit token values in `globals.css` by hand; use `/frontend-kit:theme`.
3. **Skill / Plugin Rules (`frontend-kit:rules`)**: Provides contextual guidelines and runtime patterns (e.g. status color labels, component composition, motion limits). If the committed marker version in `AGENTS.md` is older than the installed plugin, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/write-rules.mjs" .` to update it.
4. **External Plugin Rules**: In case of conflicting guidance from external plugins (such as `vercel:shadcn` advising `shadcn init -d`), follow the kit's explicit ground rules (Radix Nova base, no raw hex colors, strict Tailwind v4 compatibility).

---

## Key Engineering Rules & Patterns

### 1. Semantic Tokens Over Raw Colors
Always use design tokens instead of hardcoded hex, rgb, or oklch colors:
- Good: `className="bg-card text-card-foreground border-border"`
- Bad: `className="bg-[#18181b] text-white border-zinc-800"`

### 2. Accessible Status Colors
Status colors are visual signals, not text colors. Always pair them with accessible text labels or icons:
- Good:
  ```tsx
  <Badge variant="outline" className="gap-1.5 border-status-live/30 bg-status-live/10 text-foreground">
    <span className="size-1.5 rounded-full bg-status-live" aria-hidden="true" />
    <span>Active</span>
  </Badge>
  ```
- Bad: `className="text-status-warning"` (insufficient contrast on light ground) or `<span className="size-2 rounded-full bg-status-live" />` with no accompanying label.

### 3. Sizing Shorthands
Use Tailwind v4 `size-N` instead of redundant width and height classes:
- Good: `size-4`, `size-8`, `size-10`
- Bad: `w-4 h-4`, `w-8 h-8`, `w-10 h-10`

### 4. Component Composition
Use primitives from the project's configured UI alias instead of unstyled clickable elements:
- Good: `<Button variant="ghost" size="sm">` from `@/components/ui/button`
- Bad: `<div onClick={handleClick} className="cursor-pointer">`

### 5. Forms
Use structured form primitives (`<FieldGroup>`, `<Field>`) from `@/components/ui/field` rather than ad-hoc spacing:
- Good:
  ```tsx
  <FieldGroup>
    <Field>
      <Label htmlFor="name">Name</Label>
      <Input id="name" />
    </Field>
  </FieldGroup>
  ```
- Bad: `<div className="space-y-4"><div><label ... /><input ... /></div></div>`

### 6. Motion & Animations
- Always import from `motion/react` (never `framer-motion`).
- Always respect reduced motion:
  ```tsx
  import { useReducedMotion, motion } from "motion/react";

  export function AnimatedCard({ children }: { children: React.ReactNode }) {
    const shouldReduceMotion = useReducedMotion();
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    );
  }
  ```
- Never animate layout properties like `width`, `height`, `top`, or `left`; animate `opacity` and `transform` (`scale`, `x`, `y`) only.
- In GSAP projects, never call `gsap.to()` directly inside `useEffect()` without `useGSAP()` or cleanup.
- In React Three Fiber projects, never render `<Canvas>` in a Server Component without dynamic client wrapping (`ssr: false`).
