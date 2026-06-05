# Changelog

All notable changes to cue (`cue-ai`) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the project
adheres to [Semantic Versioning](https://semver.org/).

## [0.9.2] — 2026-06-05

### Added

- **Live code-review visibility.** Watch an independent review move file-by-file in
  real time instead of staring at an opaque "Precipitating…" spinner.
  - `bin/cue-review-watch` — live renderer; run it in a second pane to follow the
    latest review (`--id <id>` for a specific one, `--once` for a snapshot).
  - `bin/cue-review-progress` — append-only progress events to
    `~/.config/cue/review-progress/<id>.jsonl` (the shared schema every reviewer writes).
  - `/code-review` now emits per-file / per-dimension / per-finding progress events.
  - The `auto-review` Stop-hook gate records its review to the same log, so the
    independent merge-gate review is watchable too (verdict parsed with the progress
    side-channel filtered out; invariants unchanged: recursion guard, fail-open,
    binary verdict).
  - Docs: [`docs/review-visibility.md`](./docs/review-visibility.md).
- **Self-learner (experimental · opt-in · default-OFF).** Profiles capture where their
  skills fell short during a task and feed gated improvements back over time.
  - `resources/hooks/profile-self-improve.sh` — friction-signal capture plus an optional
    live critic agent. Recursion-guarded, never blocks Stop, runs the critic at most once
    per session, fully fail-open.
  - New `skill_gap` analytics event (`src/lib/analytics.ts`), inert to existing readers.
  - Piloted on the `skill-writer` profile. Enable with
    `touch ~/.config/cue/.auto-improve-enabled`. Docs: [`docs/self-learner.md`](./docs/self-learner.md).

### Documentation

- **README — "what you'll see during a run — the reviewer".** Explains the independent
  review gate that runs during a Claude Code session: why a red "Stop hook error" means
  the gate is working (not a failure), how to suppress or disable it, and how to watch a
  review live with `cue-review-watch`. Includes a real catch (a `weight` kg/g unit
  ambiguity that would have rendered per-kg prices as `€0.00`).

[0.9.2]: https://github.com/opencue/cuecards/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/opencue/cuecards/releases/tag/v0.9.1
