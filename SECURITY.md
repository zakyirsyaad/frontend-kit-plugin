# Security policy

## Supported versions

Pre-1.0: only the latest released version receives fixes. The version in
`.claude-plugin/plugin.json` is authoritative.

## Reporting a vulnerability

Report privately through GitHub Security Advisories on this repository
("Security" → "Report a vulnerability"). Please do not open a public issue for
anything exploitable.

Include: what the plugin did, the command or skill involved, the project shape
it ran against, and the smallest reproduction you have. Expect an
acknowledgement within a week; this is a personal project, not a staffed one.

## What this plugin does on your machine

- Runs `create-next-app@16`, `shadcn@4`, and your package manager (bun, pnpm,
  npm or yarn) as child processes, with arguments the skills define.
- Reads and writes files inside the project directory you point it at:
  `globals.css`, `layout.tsx`, `AGENTS.md`/`CLAUDE.md`, `.frontend-kit.json`,
  `components.json`, and files it copies from `templates/`.
- Contacts the network only through those tools: npm, `ui.shadcn.com`, and the
  Aceternity/Magic UI registries when you ask for one of their components.
- Collects no telemetry and sends no data anywhere.

## Boundaries the skills keep

- No `git stash`, `commit`, `checkout` or `clean` on your behalf; a dirty
  working tree is reported, not silently modified.
- Every write path supports `--dry-run`, and changes to an existing project are
  confirmed before they are applied.
- `eslint.config.*` is never edited.
- Third-party registry components are reviewed before installation and are
  never vendored into this repository.

## Third-party code you install through the plugin

Components added from the Aceternity or Magic UI registries become part of your
project and are your responsibility to review. The plugin reports their npm
dependencies, CSS changes and risky patterns before installing, but it does not
audit the upstream registries.
