# cue v4 — Platform, Ecosystem & Intelligence (#23–#37, skip #35)

> Status: **implementing**
> Depends on: v3-improvements.md (#9–#22)

---

## 23. Profile-Aware Colony Dispatch

**Goal:** When Colony dispatches agents, auto-resolve profile from task type.

### Mechanism

A mapping file `resources/colony-profiles.yaml`:

```yaml
rules:
  - match: [review, audit, security]
    profile: backend
  - match: [blog, docs, write, content]
    profile: docs-writer
  - match: [ui, frontend, component, css]
    profile: frontend
  - match: [deploy, ci, docker]
    profile: backend
  - match: [design, brand, image]
    profile: creative-media
  - match: [research, find, lookup]
    profile: research
default: full
```

### Command

```
cue colony-dispatch --task "review PR #42"  → resolves to "backend"
cue colony-dispatch --task "write blog post" → resolves to "docs-writer"
```

### Implementation

- `src/lib/colony-dispatch.ts` — keyword matcher against rules
- `src/commands/colony-dispatch.ts` — CLI command
- Returns profile name on stdout for Colony to consume

---

## 24. Cross-Agent Profile Coordination (Lockfile)

**Goal:** Prevent concurrent agents from stomping on the same runtime dir.

### Mechanism

On materialize, write `~/.config/cue/runtime/<profile>/<agent>/.active-pid` with the current PID. Before materializing, check if that PID is still alive:
- Alive → wait (with timeout) or use a shared read-only copy
- Dead → remove stale lockfile, proceed

### Implementation

- `src/lib/runtime-lock.ts` — acquire/release/check lock
- Hook into `runtime-materializer.ts` before the atomic swap

---

## 25. Profile Token Budget Estimation

**Goal:** Show how many tokens a profile costs in system prompt overhead.

### Command

```
cue cost [profile]
cue cost backend
# Skills:    ~2,400 tokens (8 skills)
# MCPs:     ~800 tokens (tool descriptions)
# CLAUDE.md: ~1,200 tokens
# Total:    ~4,400 tokens
```

### Token Estimation

Approximate: 1 token ≈ 4 characters (English text). Read all skill SKILL.md files + CLAUDE.md layers + MCP tool count × ~50 tokens per tool.

### Implementation

- `src/commands/cost.ts`

---

## 26. Skill Compression / Summarization

**Goal:** For heavy profiles, generate a condensed skill index.

### Mechanism

When a profile has >10 skills, generate `~/.config/cue/runtime/<profile>/claude/skills/_index.md`:

```markdown
# Skill Index (15 skills loaded)

| Skill | Trigger | Category |
|---|---|---|
| review/code-review | "review this code", /code-review | review |
| stripe/stripe-webhooks | stripe webhook setup | stripe |
...

For full skill details, read the individual skill file in ./skills/<id>/SKILL.md
```

This gives the LLM a quick lookup table instead of reading 15 full SKILL.md files.

### Implementation

- `src/lib/skill-compressor.ts` — generate the index
- Hook into materializer: if skills.length > threshold, write the index

---

## 27. `cue trace` — Live Session Inspector

**Goal:** Tail active session and show skill/MCP invocations in real-time.

### Command

```
cue trace [--profile <name>]
```

### Mechanism

Watch the active session's JSONL file (`~/.claude/projects/*/sessions/*/`) for new lines. Parse each line for:
- Tool calls (MCP invocations)
- Skill file reads
- Slash command triggers

### Implementation

- `src/commands/trace.ts` — uses `fs.watch` on the latest session file

---

## 28. `cue replay` — Session Replay with Different Profile

**Goal:** "What if I'd used profile X instead?"

### Command

```
cue replay <session-id> --profile full
cue replay latest --profile frontend
```

### Mechanism

1. Load the session transcript
2. Extract user messages
3. List which skills would have been available under the target profile
4. Report: "Skills that would have been available: +3, Skills that were missing: -2"

(No actual LLM re-execution — just a diff of available capabilities.)

### Implementation

- `src/commands/replay.ts`

---

## 29. `cue skills test` — Skill Unit Tests

**Goal:** Validate skills with example inputs/outputs.

### Test Format

```
resources/skills/skills/review/code-review/test/
  case-1.md    # input: user message, expected: skill triggers
  case-2.md    # input: code snippet, expected: review output pattern
```

Each test file:
```markdown
---
input: "Review this function for security issues"
expect_contains: ["security", "input validation"]
expect_not_contains: ["LGTM"]
---
```

### Command

```
cue skills test review/code-review
cue skills test --all
```

### Implementation

- `src/commands/skills-test.ts`
- Pattern matching against skill description + body

---

## 30. `cue skills lint` — Skill Quality Checker

**Goal:** Catch common skill authoring mistakes.

### Rules

| Code | Check | Severity |
|---|---|---|
| S1 | Description missing or < 10 chars | error |
| S2 | Body > 5000 tokens (~20KB) | warning |
| S3 | No examples in body | warning |
| S4 | Frontmatter missing `description` | error |
| S5 | Duplicate slug across categories | error |
| S6 | Tags empty | info |
| S7 | No trigger phrases in description | warning |

### Command

```
cue skills lint [id]
cue skills lint --all
```

### Implementation

- `src/commands/skills-lint.ts`

---

## 31. `cue skills new` — Skill Scaffolding

**Goal:** One command to create a new skill with proper structure.

### Command

```
cue skills new review/my-checker
cue skills new --category review --name my-checker --description "..."
```

### Creates

```
resources/skills/skills/review/my-checker/
  SKILL.md    # with frontmatter template
```

### Implementation

- `src/commands/skills-new.ts`

---

## 32. `cue update` — Self-Update + Skill Sync

**Goal:** Keep cue and its resources up to date.

### Command

```
cue update              # git pull + bun install + rematerialize
cue update --skills     # only sync resources/skills submodule
cue update --check      # show what would change
```

### Implementation

- `src/commands/update.ts`
- Runs `git pull` in repo root and each sub-repo (resources/skills, resources/mcps)
- Runs `bun install` if package.json changed
- Rematerializes active profiles

---

## 33. Skill Pinning & Rollback

**Goal:** Pin a skill to a specific version/commit.

### Profile Schema Extension

```yaml
skills:
  local:
    - review/code-review          # unpinned — uses HEAD
    - id: stripe/stripe-webhooks
      pin: git@abc123f            # pinned to commit
```

### Commands

```
cue skills pin review/code-review          # pin to current commit
cue skills rollback review/code-review     # revert to previous pin
cue skills unpin review/code-review        # remove pin
```

### Implementation

- `src/commands/skills-pin.ts`
- Stores pin history in `~/.config/cue/pin-history.json`

---

## 34. Profile Inheritance Tree Visualization

**Goal:** Show the full inheritance tree with resources at each level.

### Command

```
cue tree [profile]
cue tree backend
```

### Output

```
🐻 backend
└── 🐢 core
    ├── skills: meta/analyze, meta/just, caveman/caveman, caveman/caveman-commit
    ├── plugins: claude-mem
    └── mcps: (none)
├── skills: review/api-tester, review/code-review, review/security-*, stripe/*, ...
├── mcps: coolify
└── plugins: (none additional)
```

### Implementation

- `src/commands/tree.ts`

---

## 36. GitHub Action for Profile Validation

**Goal:** CI step that validates profiles on PRs.

### Workflow

```yaml
# .github/workflows/validate-profiles.yml
name: Validate Profiles
on:
  pull_request:
    paths: ['profiles/**', 'resources/**']
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bin/cue validate --all
      - run: bin/cue doctor
```

### Implementation

- `.github/workflows/validate-profiles.yml`

---

## 37. Webhook on Profile Change

**Goal:** Notify external systems when profiles are modified.

### Configuration

```yaml
# ~/.config/cue/config.yaml
webhooks:
  - url: https://hooks.slack.com/services/T.../B.../xxx
    events: [profile.modified, profile.created]
  - url: https://my-dashboard.internal/cue-events
    events: [profile.modified]
```

### Implementation

- `src/lib/webhooks.ts` — load config, fire POST on events
- Hook into profile-modifying commands (skills add/remove, mcps add/remove, lock/unlock)
