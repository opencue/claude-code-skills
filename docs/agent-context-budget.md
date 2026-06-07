# Agent Context Budget

This repo ships profile definitions, skills, MCP configs, setup manuals, test
fixtures, and generated catalogs. Many files are intentionally large. Keep the
always-injected agent prompt small and open detailed docs only when needed.

## Permanent Defaults

- First-run onboarding should default to `core`.
- Broader composites such as `core+skill-writer` or `core+caveman-quick` should
  be opt-in.
- Setup docs may describe optional composites, but the low-context path is
  `core` until the user asks for more.

## Files To Avoid Loading By Default

- `resources/skills/catalog/*.json`
- `resources/skills/skills/**/test/fixtures/*`
- `resources/skills/skills/**/fixtures/*`
- `docs/assets/*.svg`
- `dist/*`
- `node_modules/*`
- package-manager caches
- `~/.config/cue/analytics.jsonl`
- `~/.config/cue/session-log.jsonl`

Use `wc -c` or `du -h` first, then a narrow `rg`, `head`, `tail`, or `sed -n`.

## Lean Install Guidance

Use `setup/lean-cue.md` for the smallest path. It should install cue and pin
`core` by default. Caveman, RTK, skill-writing, memory, gbrain, and Office MCPs
are optional add-ons.

## Onboarding Source

`src/commands/init.ts` controls first-run global onboarding. Keep the first
option and `initialValue` aligned with the low-context default:

```text
core
```

Tests around default-profile parsing live in `src/lib/cwd-resolver.test.ts`.
Those tests should continue allowing composites; the change is only the default
recommendation.
