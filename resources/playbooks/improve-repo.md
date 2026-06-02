# Playbook: Improve an existing repo

Use when the user says "improve this repo", "make this codebase better", "clean
this up", "what should we fix here", or activates the `improver` profile. The
point of the playbook is that you work in **priority order with a check at
every step**, instead of polishing whatever you happen to notice first.

```
1. UNDERSTAND    /analyze            grounded cross-file read of the area
                 /health             repo-wide quality score + trend BASELINE
2. RANK          /roi-estimator      list candidate fixes, tag each
                                     dimension +N% 🟢/🟡/🟠 — do highest first
3. GOAL          /goal               restate the top item as a measurable
                                     goal + a runnable success check
4. CHANGE        smallest diff that moves the check → run check → commit
                 /careful /freeze    when the blast radius is real
5. REVIEW        /code-review-deep   on the diff before calling it done
                 /cso                if it touched auth / input / secrets
6. VERIFY        /verify             independent audit of decision-relevant
                                     claims; re-run /health vs the baseline
7. REFLECT       /retro              what to do differently next pass
```

Skip stages that don't apply — a one-line fix needs neither `/analyze` nor
`/health`. But never skip **RANK** (or you polish low-value code) or the check
in **GOAL** (or "improvement" is just a vibe).

## Pick the right lever for the kind of debt

| The repo's pain is… | Reach for |
|---|---|
| "I don't understand this code" | `/analyze`, then `/health` for the score |
| Slow / regressing performance | `/goal` with a `/benchmark` number as the check |
| Security / auth / input handling | `/cso` (OWASP + STRIDE) |
| Flaky / missing tests | `/goal` with a "passes N/N runs" check |
| Stale docs / config drift | update docs (`/document-release` via smart-loader) |
| Don't know what to fix | `/health` + `/roi-estimator` to rank the findings |

## Anti-patterns

- ❌ Fixing the first thing you notice instead of the highest-ROI thing. RANK
  exists so impact, not salience, drives the order.
- ❌ "Improving" by adding scope — a refactor that isn't the goal is a
  separate, flagged follow-up, not a rider on this diff.
- ❌ Claiming an improvement without re-running the check. Reading the code is
  not proof the metric moved.
- ❌ Skipping the baseline. Without Step 1's `/health` number you can't show
  the repo actually got better.
