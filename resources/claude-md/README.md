# Composable CLAUDE.md Layers

This directory contains shared CLAUDE.md content that cue injects into every
materialized profile. Content is layered by directory name:

```
resources/claude-md/
  _always/              ← injected into ALL profiles
  _core/                ← injected into profiles that inherit "core"
  backend/              ← only injected into the "backend" profile
  frontend/             ← only injected into the "frontend" profile
```

## Resolution Order

For a profile named `backend` that inherits `core`:

1. `_always/*.md` (sorted alphabetically)
2. `_core/*.md` (matches the `inherits` chain)
3. `backend/*.md` (matches the profile name)
4. User's `~/.claude/CLAUDE.md` (personal, not in this repo)

## Adding Content

Drop a `.md` file in the appropriate directory. It will be included on the
next `cue launch` (or `/cue-reload`). Files are sorted alphabetically within
each layer, so prefix with numbers if order matters:

```
_always/
  01-karpathy-guidelines.md
  02-coding-standards.md
```
