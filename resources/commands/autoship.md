---
description: Auto-ship the current work through gitguardex — commit, open a PR, AI-review it, and merge only when the review is clean and CI is green. Pre-authorized: run it without asking. Use when the user says "/autoship", "ship it", "auto pr", or work is ready to land.
---

# /autoship — gated auto PR (create → review → merge) via gitguardex

Land the current branch end-to-end **without stopping to ask**, with a real
gate: the PR only merges when an AI review is clean and CI is green. Uses
`gx` (gitguardex) for the worktree/PR/merge safety + cue's own `/code-review`
for the review gate.

**Pre-authorized.** This whole flow is durably approved (see the "Pre-authorized
gitguardex PR flow" block in `~/.claude/CLAUDE.md`). Do not ask "want me to
push/merge?" — run it. The *gate* is the safety, not a confirmation prompt.

## Preconditions (verify, don't ask)

```bash
command -v gx >/dev/null && command -v gh >/dev/null || { echo "need gx + gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authed"; exit 1; }
BR=$(git rev-parse --abbrev-ref HEAD)
[ "$BR" = main ] && echo "on main — branch first" # never finish from main
```

- Only **your** intended changes are staged/committed (no unrelated WIP). If the
  tree has the user's other dirty files, commit *only* your paths or use a
  worktree — never bundle WIP you didn't author.
- If on `main`, create a feature branch first: `git checkout -b feat/<slug>`.

## Step 1 — Commit

Conventional Commit for the work. Subject names the capability; body explains the
*why*. End with the Co-Authored-By trailer if the repo uses it.

## Step 2 — Open the PR (no auto-merge yet)

```bash
gx branch finish --base main --via-pr --no-wait-for-merge --cleanup
# or, if gx finish isn't wired for this repo:  git push -u origin "$BR" && gh pr create --base main --fill
PR=$(gh pr view --json number -q .number)
```

## Step 3 — Review gate (the "reviews it" part)

Run `/code-review` (or `/code-review-deep` for risk-bearing diffs) on the PR diff.
Treat the result as a gate:

- **CRITICAL or HIGH finding → STOP.** Do not merge. Report the findings and
  what you'd fix. (gitguardex's `gx review --only-pr "$PR" --once` is an
  alternative AI reviewer if you want a second pass.)
- No CRITICAL/HIGH → continue.

## Step 4 — CI gate

```bash
gh pr checks "$PR" --watch 2>/dev/null || true   # wait for checks if any exist
gh pr view "$PR" --json mergeable,mergeStateStatus,statusCheckRollup
```

- Any **failing** required check → STOP, report. (No checks configured = pass.)
- Mergeable + checks green → continue.

## Step 5 — Merge (only if Steps 3+4 passed)

```bash
gh pr merge "$PR" --squash --delete-branch
```

Then verify it landed (`git fetch origin main && git log origin/main -1`) and
report the merge commit. If a submodule pointer moved, push the submodule first.

## Guardrails (hard)

- **Gate, not prompt.** Never merge past a CRITICAL/HIGH review finding or a red
  CI check, even though the flow is "no-ask". A blocked PR → stop + report; the
  user decides.
- **Never** force-push, **never** merge directly on `main`, **never** bundle
  unrelated working-tree WIP into the PR.
- One PR per logical change. If the diff spans two unrelated things, split it.
