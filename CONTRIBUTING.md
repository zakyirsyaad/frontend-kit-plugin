# Contributing

This is a personal plugin, but issues and pull requests are welcome.

## Before you start

Open an issue first for anything larger than a fix, so scope can be agreed
before code is written. The README describes what each skill and script does;
the ground rules below are what a change has to respect.

## Ground rules

- **Computable checks belong in scripts, not in prose.** If a rule can be
  verified deterministically, put it in `scripts/` with a test instead of
  describing it in a SKILL.md.
- **Scripts are Node ESM with zero dependencies**, run with `node`, CRLF-safe,
  and built on `node:path`. Every script that writes supports `--dry-run` and
  `--json`, and exits 0 (ok), 1 (fixable) or 2 (unsupported project shape).
- **No personal paths** (`/Users/…`, `~/.claude/…`) in anything shipped —
  reference `/frontend-kit:*` commands and `${CLAUDE_PLUGIN_ROOT}`.
- **Tests are offline.** Record fixtures from real runs instead of reaching for
  the network at test time.
- **shadcn:** always `shadcn@4 … init -b radix -p nova -y --no-reinstall`.
  Ignore advice to use `init -d`; in shadcn 4.x that selects Base UI.
- Verify each phase from its real result, never from the exit code alone — some
  CLI prompts exit 0 without doing anything when stdin is closed.

## Checks before a pull request

```bash
node --test "tests/**/*.test.mjs"
claude plugin validate . --strict
node scripts/refresh-palettes.mjs --check
```

End-to-end runs happen in a scratch directory (for example `../_fk-e2e/`), never in
a real project. Put the results in the pull request description: date, tool
versions, commands and what you checked.

## Commits and releases

Conventional commit subjects (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), with
the task ID in parentheses when one applies, for example `feat(theme): … (F5)`.

Releases: `node scripts/bump-version.mjs <version>` keeps `plugin.json` and
`marketplace.json` in sync, then update `CHANGELOG.md` and run
`claude plugin tag . --dry-run` followed by `--push`. The plugin cache is keyed
by version, so an unchanged version never reaches users.
