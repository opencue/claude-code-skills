# cue v2 — Skill & MCP Management Improvements

> Design doc for 8 improvements to cue's resource management.
> Status: **implementing**

---

## Overview

These improvements make cue's skill and MCP management accessible from inside
Claude Code sessions (not just the terminal), add health/drift detection, and
introduce composable CLAUDE.md layers and a remote skill marketplace.

---

## 1. `/cue-skills` Slash Command

**Goal:** Browse, search, add, and remove skills without leaving Claude Code.

### Commands

| Invocation | Behavior |
|---|---|
| `/cue-skills` | List skills in the active profile (grouped by category) |
| `/cue-skills search <query>` | Fuzzy search all available skills (name, description, tags) |
| `/cue-skills add <id>` | Add a skill to the active profile, rematerialize |
| `/cue-skills remove <id>` | Remove a skill from the active profile, rematerialize |
| `/cue-skills available` | List all skills NOT in the current profile |

### Implementation

- New file: `plugins/cue/commands/cue-skills.md`
- The slash command instructs Claude to shell out to `cue skills <subcommand> --json`
- New CLI subcommands in `src/commands/skills.ts`:
  - `cue skills list [--json]` — skills in active profile
  - `cue skills available [--json]` — all skills not in active profile
  - `cue skills search <query> [--json]` — fuzzy match across catalog
  - `cue skills add-to-profile <id>` — append to active profile.yaml
  - `cue skills remove-from-profile <id>` — remove from active profile.yaml

---

## 2. `/cue-mcps` Slash Command

**Goal:** List, add, remove, and health-check MCP servers from inside Claude Code.

### Commands

| Invocation | Behavior |
|---|---|
| `/cue-mcps` | List MCPs in the active profile with status |
| `/cue-mcps add <id>` | Add an MCP to the active profile |
| `/cue-mcps remove <id>` | Remove an MCP from the active profile |
| `/cue-mcps available` | List all MCPs not in the current profile |
| `/cue-mcps health` | Ping each MCP, report up/down/latency |

### Implementation

- New file: `plugins/cue/commands/cue-mcps.md`
- New CLI: `src/commands/mcps.ts`
  - `cue mcps list [--json]`
  - `cue mcps available [--json]`
  - `cue mcps add <id>`
  - `cue mcps remove <id>`
  - `cue mcps health [--json]`

---

## 3. Skill Tags & Categories

**Goal:** Make skills searchable/filterable by domain tags.

### SKILL.md Frontmatter Extension

```yaml
---
description: "When user asks for code review, run structured review"
tags: [review, security, backend]
category: review
agents: [claude-code]
---
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `tags` | string[] | no | Free-form tags for search/filter |
| `category` | string | no | Primary category (defaults to parent dir name) |
| `agents` | string[] | no | Which agents this skill applies to |

### Implementation

- Extend `src/lib/resolver-local.ts` to parse tags from SKILL.md frontmatter
- `cue skills search --tag <tag>` filters by tag
- Tags shown in `/cue-skills search` output

---

## 4. `cue doctor --fix`

**Goal:** Detect drift between declared profiles and actual disk state.

### Checks

| Code | Check | `--fix` action |
|---|---|---|
| `D1` | Skill in profile.yaml but not on disk | Remove from profile / re-fetch if npx |
| `D2` | MCP in profile.yaml but not in registry | Remove from profile |
| `D3` | Orphan skill (on disk, not in any profile) | Report only (no auto-delete) |
| `D4` | Skill requires MCP not in profile | Add MCP to profile |
| `D5` | Stale runtime hash (profile changed, runtime not rebuilt) | Rematerialize |
| `D6` | Broken symlink in materialized runtime | Rematerialize |

### Implementation

- Flesh out `src/commands/doctor.ts`
- Reads all profiles, cross-references with disk state
- `--fix` applies safe repairs, `--dry-run` (default) reports only
- Exit code: 0 = healthy, 1 = issues found

---

## 5. Skill → MCP Dependency Declarations

**Goal:** Skills can declare which MCPs they need to function.

### SKILL.md Frontmatter Extension

```yaml
---
description: "Colony task dispatch and coordination"
requires_mcps: [colony]
tags: [orchestration, multi-agent]
---
```

### Behavior

- At materialize time: warn if a skill's `requires_mcps` aren't in the profile
- `cue doctor` check D4 catches this
- `/cue-skills add <id>` auto-suggests adding required MCPs
- `cue validate` reports missing MCP dependencies as warning W6

---

## 6. Composable `resources/claude-md/` with Profile-Aware Layers

**Goal:** Ship shared CLAUDE.md content with cue, with per-profile overrides.

### Directory Structure

```
resources/claude-md/
  _always/                    ← injected into ALL profiles
    karpathy-guidelines.md
    coding-standards.md
  _core/                      ← injected into profiles inheriting core
    memory-protocol.md
  backend/                    ← only injected into "backend" profile
    api-conventions.md
  frontend/                   ← only injected into "frontend" profile
    react-patterns.md
```

### Resolution Order

For a profile named `backend` that inherits `core`:

1. `_always/*.md` (sorted alphabetically)
2. `_core/*.md` (matches the `inherits` chain)
3. `backend/*.md` (matches the profile name)
4. User's `~/.claude/CLAUDE.md` (personal, not in repo)

### Implementation

- Modify `readSharedClaudeMd()` in `launch.ts` to accept the resolved profile
- Walk the inheritance chain and collect matching directories
- Concatenate in order, dedupe by filename if same file appears at multiple levels

---

## 7. Hot-Reload Without Restart

**Goal:** `/cue-reload` actually rematerializes and takes effect without restarting Claude Code.

### How It Works

Claude Code re-reads `CLAUDE.md` and `settings.json` from `CLAUDE_CONFIG_DIR`
on certain triggers. The materializer already does atomic swap. The flow:

1. `/cue-reload` → shell out to `cue launch --rematerialize`
2. `--rematerialize` flag: resolve current profile, force-rebuild runtime (ignore hash), exit 0
3. Claude Code picks up the new `CLAUDE.md` content on next turn

### Limitations

- MCP server changes require Claude Code restart (MCP connections are long-lived)
- Skill changes take effect immediately (they're just files Claude reads on demand)
- `settings.json` changes (plugins, permissions) require restart

### Implementation

- Add `--rematerialize` flag to `launch.ts`
- Update `plugins/cue/commands/cue-reload.md` to call it and report what changed

---

## 8. `cue marketplace` — Remote Skill Registry

**Goal:** Search and install skills from a remote index.

### Commands

```
cue marketplace search <query>    → search remote registry
cue marketplace install <id>      → download + add to profile
cue marketplace publish <path>    → submit a skill to the registry
cue marketplace list              → browse all available
```

### Registry Format

A `registry.json` hosted on GitHub Pages (or raw GitHub):

```json
{
  "version": 1,
  "skills": [
    {
      "id": "recodeee/k8s-skills/k8s-deploy",
      "repo": "recodeee/k8s-skills",
      "name": "k8s-deploy",
      "description": "Kubernetes deployment best practices",
      "tags": ["kubernetes", "deployment", "devops"],
      "version": "1.0.0",
      "pin": "tag@v1.0.0"
    }
  ]
}
```

### Implementation

- New file: `src/commands/marketplace.ts`
- Registry URL configurable via `CUE_REGISTRY_URL` env var
- Default: `https://raw.githubusercontent.com/recodeee/cue-registry/main/registry.json`
- `install` wraps `cue skills add` with the resolved repo + pin
- Local cache in `profiles/_cache/marketplace/registry.json` (TTL: 1 hour)

---

## File Changes Summary

| New/Modified | Path |
|---|---|
| New | `docs/superpowers/specs/v2-improvements.md` (this doc) |
| New | `plugins/cue/commands/cue-skills.md` |
| New | `plugins/cue/commands/cue-mcps.md` |
| Modified | `plugins/cue/plugin.json` (add new commands) |
| Modified | `plugins/cue/commands/cue-reload.md` (hot-reload) |
| New | `src/commands/mcps.ts` |
| Modified | `src/commands/skills.ts` (add list/search/add-to-profile/remove) |
| Modified | `src/commands/doctor.ts` (full implementation) |
| New | `src/commands/marketplace.ts` |
| Modified | `src/commands/launch.ts` (--rematerialize, composable claude-md) |
| Modified | `src/commands/_index.ts` (register new commands) |
| Modified | `src/lib/resolver-local.ts` (parse tags, requires_mcps) |
| Modified | `src/lib/runtime-materializer.ts` (dependency warnings) |
| Modified | `src/lib/profile-linter.ts` (W6 missing MCP dep) |
| New | `resources/claude-md/_always/karpathy-guidelines.md` (move from flat) |

---

## Migration

- Existing profiles: no changes required (all new fields are optional)
- Existing skills: no changes required (tags/requires_mcps default to empty)
- `resources/claude-md/karpathy-guidelines.md` → moves to `resources/claude-md/_always/`
