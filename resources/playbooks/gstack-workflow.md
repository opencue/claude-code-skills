# Playbook: Route the gstack roles end-to-end (spec → build → review → ship → deploy)

Use when the user wants a feature carried from idea to production through the
gstack roles, and you need to know which role owns each step. This is the
role-routing flow: run one specialist role, finish it, hand its artifact to the
next. (For a generic sprint use `sprint.md`; for one TDD feature use
`ship-feature.md`. This one is about *which role* runs *when*.) Some stages are
branch-only, marked "When needed:" run them only when the trigger fires.

## 1. Shape the idea with /spec

Turn vague intent into an executable spec: inputs, outputs, edges, and the one
acceptance check that proves it works. Don't skip to code on a fuzzy ask.

- **Verify:** the spec names a single checkable acceptance property.

## 2. Review the plan before any code

Run `/plan-devex-review` for developer-facing surfaces (CLI, API, SDK) and
`/plan-design-review` for UI surfaces. Run `/autoplan` (via core) for a
greenfield feature to chain office-hours → ceo → eng. Skip the review that
doesn't match the surface.

- **Verify:** every flagged plan gap has an owner or an explicit "won't fix."

## 3. Build under safety rails with /careful

Exit plan mode and write the smallest change that satisfies the spec. Run
`/careful` to block softer destructive bash; `/freeze <dir>` to lock edits to
one directory; `/guard <dir>` for prod or live-system work. Use `feature-dev`
to scaffold and `build-fix` when the build breaks.

- **Verify:** the diff traces line-by-line back to the step 1 spec, nothing extra.

## 4. When needed: root-cause any bug with /investigate

When a test fails or behavior is wrong, run `/investigate` instead of patching.
It enforces the iron law: no fix without a root cause. Stops after 3 failed
fixes and reassesses.

- **Verify:** you can state in one sentence why the fix addresses the cause.

## 5. Review the diff with /code-review-deep

Run `/code-review-deep` (via core) on the diff before calling it done. Pass 1
catches SQL safety, race conditions, shell injection, and trust-boundary slips;
pass 2 covers the rest. Route a UI diff to `/design-review` and a
developer-facing diff to `/devex-review` for a second specialist pass.

- **Verify:** zero open CRITICAL findings; HIGH findings are fixed or waived in writing.

## 6. QA in a real browser with /qa

Run `/qa` to drive the live app, find bugs, and fix them; use `/qa-only` when
you want a report without edits. For visual polish run `/design-review`; to
explore alternatives run `/design-shotgun`. QA reads the screen, it does not
read the CSS and assume.

- **Verify:** the acceptance check from step 1 passes in a real browser.

## 7. Confirm the change with /verify

Run `/verify` to independently audit the decision-relevant claims and re-check
behavior against the spec. Run `/health` to score the repo and compare against
the pre-change baseline.

- **Verify:** `/health` is flat or up versus baseline; no claim rests on unread code.

## 8. Ship with /ship

Run `/ship` to detect and merge the base branch, run tests, review the diff,
bump VERSION, update CHANGELOG, commit, push, and open the PR. Confirm before
pushing. Shipping is the first hard-to-reverse step.

- **Verify:** the PR is open, CI is green, and the diff is exactly the reviewed one.

## 9. Land and deploy with /land-and-deploy

Run `/land-and-deploy` to merge the PR, wait for CI and deploy, and verify
production health. Run `/setup-deploy` first if the deploy config is missing.
Get an explicit go-ahead before the merge.

- **Verify:** the PR merged and the deploy reported healthy.

## 10. Watch the deploy with /canary, then /document-release

Run `/canary` to watch production for console errors and regressions against
the pre-deploy baseline. Then run `/document-release` to sync README, CHANGELOG,
and CLAUDE.md to what actually shipped.

- **Verify:** canary is clean and the docs match the shipped behavior.

**See also:** `playbooks/sprint.md` (generic ship loop), `playbooks/improve-repo.md` (ROI-ranked improvement loop)

## Anti-patterns to avoid

- Blending two roles in one pass. Finish the review role before starting QA.
- Reading the CSS and claiming the UI looks right. QA roles open the browser.
- Running `/code-review-deep` after `/ship`. The window to act is before merge.
- Skipping `/spec` because the feature "seems obvious." It is the cheapest step.
- Chaining roles without reading the prior role's artifact. Each step exists to
  consume the last one's output.
