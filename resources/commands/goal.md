---
description: Goal-driven execution — restate the ask as a measurable goal with a runnable success check, rank the ways to reach it by ROI, then loop smallest-change → verify until the check passes or 3 attempts fail.
---

# /goal — goal-driven execution

Turn a fuzzy request into a goal you can *prove* you hit. This replaces "make
it work" (unverifiable, invites scope creep) with a measurable target and a
check that closes it.

## Step 1 — Restate as a measurable goal + a runnable check

Rewrite the ask as **outcome + a success criterion you can run.**

| Fuzzy ask | Measurable goal + check |
|-----------|-------------------------|
| "make it faster" | p95 of `GET /search` < 200ms, proven by `<bench cmd>` |
| "fix the flaky test" | `<test>` passes 50/50: `for i in $(seq 50); do …; done` |
| "add validation" | invalid inputs rejected — new tests in `<file>` go red→green |
| "clean up the module" | same public API, tests still green, `<lint>` 0 warnings |

If you can't name a check, you don't have a goal yet — stop and define one with
the user. A check is a command, a test, a metric, or a before/after
measurement (for visual claims, a screenshot or `getBoundingClientRect`, not a
read of the CSS).

## Step 2 — Rank the ways to reach it by ROI

List the candidate approaches. If there are 3+, run `/roi-estimator` so each
carries a `dimension +N% 🟢/🟡/🟠` tag. Take the highest-ROI path first; name
the low-ROI tail as skippable. One goal at a time — don't braid two goals into
one diff.

## Step 3 — Loop: smallest change → run the check

1. Make the **smallest** change that should move the check.
2. Run the check. Capture the actual output (not "looks right").
3. Pass → commit, go to Step 5. Fail → Step 4.

## Step 4 — On failure, diagnose before retrying

- Read the failure output. State a one-line hypothesis for *why* it failed.
- Change one thing. Re-run.
- **After 3 failed attempts on the same check: stop.** The goal or the approach
  is probably wrong. Re-state the goal, escalate to `/investigate` for
  root-cause, or ask the user. Do not keep flailing.

## Step 5 — Confirm, then stop

Re-run the check one final time, clean. Report: the goal, the check, its actual
output, and the diff. Don't expand past the stated goal — extra cleanups are
separate, flagged follow-ups.

## Guardrails

- **No check = not a goal.** Refuse to "just do it" without a success criterion.
- **One goal per loop.** A new goal starts a new loop.
- **3-strike rule is a hard stop**, not a suggestion.
- A goal you "verified" by reading code instead of running the check is
  unproven — say so with the matching confidence tag.
