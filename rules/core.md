# Frontend Systems Engineering Rules

Rules for this project (managed by the frontend-kit plugin). Follow them when writing components.

## Bundle & Loading
- **Fonts**: {{fontRule}}

## Component Composition (shadcn/ui Radix + registries)
- **Primitives first**: use `<Button>`, `<Badge>`, `<Card>`, `<Tabs>`, `<Dialog>` from `{{uiAlias}}` — no clickable `div`s.
- **Forms**: `<FieldGroup>` + `<Field>` (`{{uiAlias}}/field`), not ad-hoc `space-y-*` wrappers.
- **Registry components** (Magic UI, Aceternity): add them with `/frontend-kit:effects`, which inspects the item, installs it from its registry and adapts it to these rules. Added by hand (`{{shadcn}} add @magicui/<name>`), the file is your code: review it before using it.
- **Class merging**: `cn()` from `{{utilsAlias}}`.

## Tokens
- **Tokens over hex**: `bg-background`, `bg-card`, `bg-secondary`, `border-border`, `text-primary`, `text-muted-foreground`, `bg-status-live`, `bg-status-warning`, `bg-status-error`. Never raw hex/oklch in `className`.
- **Status colors are signals, not text**: use them for dots, icons, badges and borders, and always pair them with a text label (color alone is not accessible). For body-size text use `text-foreground`/`text-muted-foreground`; `text-status-warning` on white is below 4.5:1.
- **Change the palette** with `/frontend-kit:theme [palette]` or `node ${CLAUDE_PLUGIN_ROOT}/scripts/apply-theme-tokens.mjs . --palette <name>` from the project root (current palette: `{{palette}}`) — not by hand-editing token values in `globals.css`.
- **Sizing**: `size-4`, `size-10` instead of `w-4 h-4`.

## Motion
- Import from `motion/react` (not `framer-motion`).
- Respect reduced motion: `useReducedMotion()` gates non-essential movement (or `<MotionConfig reducedMotion="user">` in layout/providers).
- Animate `transform`/`opacity` only; avoid animating `width`/`height`/`top`.

## Effects budget
- **One ambient background per page** (beams, spotlight, animated grid or dots). A second one competes with the first and with the content.
- **No decorative effects on dashboard and app routes**: a counting metric (number ticker) is the only exception.
- **Every effect respects reduced motion**: decorative effects render nothing (or a still frame), interactive ones stop moving, CSS animations get `motion-reduce:animate-none`.
