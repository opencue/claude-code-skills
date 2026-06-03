# Playbook: Run a sprint (think → plan → build → review → test → ship → reflect)

The full gstack-style sprint flow, adapted for cue. Use when the user
asks for something larger than a single fix — a feature, a refactor, a
new capability — and wants the whole thing reviewed before merge.

The point of the playbook is **you don't have to remember the order**.
Each stage feeds the next.

```
1. THINK         /office-hours        forcing questions, design doc
2. PLAN          /plan-ceo-review     scope challenge (or /autoplan)
                 /plan-eng-review     architecture lock
3. BUILD         (exit plan mode, write code)
4. REVIEW        /code-review-deep    pre-landing diff review
5. TEST          run the test suite, verify the feature manually
6. SHIP          /caveman-commit  +  open PR
7. REFLECT       /retro (weekly) or note open follow-ups
```

You can skip stages when they don't apply — a one-line bug fix doesn't
need `/office-hours`. But: never skip *review* or *test* before
shipping. Those are what make the agent trustworthy.

## When to use which review

| Building for… | Plan stage (before code) | Audit stage (after code) |
|---|---|---|
| End users (UI, web, mobile) | (skip — no design skill yet) | `/code-review-deep` |
| Backend / API / lib | `/plan-eng-review` | `/code-review-deep` + `/cso` if it touches auth/secrets |
| Architecture / data flow | `/plan-eng-review` | `/code-review-deep` |
| Everything (greenfield feature) | `/autoplan` (chains office-hours → ceo → eng) | `/code-review-deep` |

## Safety rails (optional, can run any time)

- `/careful` — block softer destructive bash (rm -rf non-build, DROP
  TABLE, force-push, kubectl/docker delete).
- `/freeze <dir>` — lock edits to one directory. Stops the agent
  "helpfully" changing unrelated code while debugging.
- `/guard <dir>` — both at once. Use for prod / live-system work.
- `/unfreeze` — release the freeze lock.

## Bug-fix variant

For a bug rather than a feature:

```
1. THINK         /investigate          root-cause, no fix yet
2. (no plan stage — fix is implied by the cause)
3. BUILD         smallest fix that addresses the stated cause
4. REVIEW        /code-review-deep     check for regressions
5. TEST          run the test added in step 1 + full suite
6. SHIP          /caveman-commit
```

`/investigate` enforces the iron law: no fix without a root cause. If
the agent can't articulate why the fix works, it's guessing.

## Anti-patterns

- ❌ Skipping THINK because the feature seems obvious. The cheapest
  thirty minutes of the sprint.
- ❌ Skipping REVIEW because tests pass. CI catches what it knows
  about; the deep review catches the rest.
- ❌ Running `/code-review-deep` AFTER ship. The window to act on
  findings is before merge.
- ❌ Chaining stages without reading the previous stage's output.
  Each stage exists because the previous stage produced an artifact
  worth consuming.
