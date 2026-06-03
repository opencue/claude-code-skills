# Playbook: Ship one repo improvement to green

Use when the user names a single improvement and wants it driven end-to-end:
`/analyze` → `/roi-estimator` → `/goal` (measurable check) → verified loop →
`/health` re-measure. This is the one-change-to-green path. For the multi-item
ranked loop that revisits priorities each pass, read `playbooks/improve-repo.md`
instead.

## 1. Baseline the metric you're about to move

- Run `/health` once, now, and record the composite score. This is the number
  you prove moved at the end.
- Run `/analyze` on the target area for a grounded cross-file read before you
  touch anything. Don't propose a fix for code you haven't read.
- **Verify:** you can name the baseline number and the file(s) the change lands in.

## 2. Confirm this is the right single change

- If you arrived with a list, run `/roi-estimator` and take only the top row.
  This playbook ships ONE item; the tail is a separate pass.
- State the one improvement in a sentence and the dimension it moves
  (speed, security, test coverage, DX).
- **Verify:** one improvement is chosen, and its ROI tag justifies doing it first.

## 3. Set a goal with a runnable check

- Run `/goal` to restate the change as a measurable goal plus a command that
  proves it: a test, a metric, a before/after capture. No check is not a goal.
- For a performance claim, make the check a `/benchmark` number, not a vibe.
- **Verify:** you have one command whose output, today, shows the goal is NOT yet met.

## 4. Sharpen scope if the change is bigger than a few lines

- Run `/spec` to turn vague intent into a precise contract when the change
  touches schema, config, auth, or more than one seam.
- Skip this for a sub-10-line fix where the seam and the check are already clear.
- **Verify:** inputs, outputs, and the one acceptance check are written down.

## 5. Change in one tight verified loop

- Write the smallest diff that moves the Step 3 check. Run the check. Commit.
- Run `/careful` (and `/freeze <dir>` when the blast radius reaches live or
  shared code) before edits that are hard to reverse.
- Resist riders: a cleanup that isn't the goal is a flagged follow-up, not part
  of this diff.
- **Verify:** the Step 3 check now passes, and the diff traces only to the goal.

## 6. Review the diff before calling it done

- Run `/code-review-deep` on the diff for correctness and safety.
- Run `/cso` when the change touched auth, user input, or secrets.
- Run `/verify` to have an independent agent audit any decision-relevant claim.
- **Verify:** no CRITICAL or HIGH findings remain open.

## 7. Re-measure and prove the delta

- Run `/health` again and compare against the Step 1 baseline. State the
  before/after numbers in one line.
- Re-run the Step 3 check one last time so the proof and the commit agree.
- Run `/retro` if this closed a chunk of work worth learning from.
- **Verify:** the health number moved the right way, or you say plainly that it
  didn't and why.

## Anti-patterns to avoid

- Skipping Step 1's `/health` baseline. Without it you can't prove the repo got
  better, only that you changed it.
- Shipping more than one improvement in this run. Two changes means you can't
  tell which one moved the number. Split them.
- Calling it done on a passing review without re-running `/health`. The review
  checks the diff; the baseline checks the repo.
- Restating an unmeasurable goal ("make it cleaner"). If `/goal` can't attach a
  runnable check, the change isn't ready for this playbook yet.
