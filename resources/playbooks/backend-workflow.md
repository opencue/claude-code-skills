# Playbook: Backend Service Feature (contract → deploy)

Use when the user asks for a new API endpoint, webhook, or service capability
on this backend profile and wants it shipped to a running deploy. This is the
backend slice end-to-end: contract first, security as a gate, CI green, then
deploy verified. Run the steps in order. Skipping the security or CI gate is
how a backend feature ships exploitable or broken.

## 1. Pin the contract (before any code)

- Name the request shape, the response shape, the error codes, and the auth
  requirement. Errors are contracts: clients parse codes, humans read messages.
- Write the one acceptance assertion that proves the endpoint works end-to-end.
- If inputs, auth, or edges are ambiguous, ask now. One question beats three
  corrections after the schema ships.
- **Verify:** the success assertion is stated as a single `curl`/test-client call.

## 2. Find the seam

- Read the 2-3 existing endpoints that do similar work. Match their validation,
  error-handling, and migration style before inventing anything.
- For a tangled or unfamiliar area, run `/investigate` to root-cause how the
  current flow behaves before you touch it.
- **Verify:** the file and pattern the new code will mirror are identified.

## 3. Write the failing contract test

- Use `/api-tester` to set up the request, auth header, and response
  assertions for the new endpoint.
- Run it. Confirm it fails because the feature is absent, not from a typo or
  import error. This is the goalpost; do not move it while implementing.
- **Verify:** the test fails because the feature is absent, not from a typo or import error.

## 4. Validate at the boundary, then minimal impl

- Add the input schema (zod / joi / pydantic) at the endpoint boundary first.
  Never trust the request body.
- Write the smallest implementation that turns the contract test green. Resist
  abstraction, config knobs, and optional params nobody asked for.
- Secrets come from env or a vault. Never hardcode, log, or return them in an
  error.
- **Verify:** the step-3 test passes and the full suite stays green.

## 5. Migrate the schema (only if data changed)

- New schema change gets a new migration file. Never edit an applied migration.
- Generate and apply via the `supabase` skill, then re-run the test against the
  migrated schema.
- **Verify:** the migration applies clean on a fresh DB and the suite still passes.

## 6. Security gate (mandatory for backend)

- Run `/security-review` on the diff: OWASP Top 10, secrets, injection, auth
  flaws. For auth, payment, or user-data paths escalate to `/cso` (OWASP +
  STRIDE).
- Fix every CRITICAL before moving on. A HIGH gets fixed or an explicit reason
  it is a false positive.
- **Verify:** no CRITICAL findings remain open.

## 7. Deep review the diff

- Run `/code-review-deep` for the pre-landing two-pass review (race conditions,
  enum completeness, trust boundaries, the rest).
- Address CRITICAL and HIGH findings before you commit.
- **Verify:** the review is clean or every flagged item is resolved or waived.

## 8. Verify the whole gate, then commit

- Run lint, typecheck, build, and the full test suite. "Compiles" is not done.
- Run `/health` to confirm the quality score did not regress.
- Commit with `/caveman-commit`: conventional subject, body explains the user need.
- **Verify:** every local check is green before the commit lands.

## 9. Get CI green and package

- Push the branch. If CI fails, run `/gh-fix-ci` to diagnose and fix it. Fix CI
  first; a red pipeline blocks merge.
- **Verify:** CI is green on the PR.

## 10. Open the PR, then land and watch

- Run `/ship` to merge-base, bump version, run tests, and open the PR. `/ship`
  stops at the open PR; it does not merge or deploy.
- Run `/land-and-deploy` to merge the PR, wait for CI and deploy, then deploy the
  backend via the `coolify` skill. Follow with `/canary` to watch the live
  service for errors and regressions against the pre-deploy baseline.
- **Verify:** the PR is open with CI green; after `/land-and-deploy` + `/canary`,
  production health is green and the acceptance call from step 1 succeeds against
  the live endpoint.

## Safety rails (any time)

- `/careful`: block softer destructive bash (DROP TABLE, force-push, rm -rf).
- `/freeze <dir>`: lock edits to the service dir while you debug.

**See also:** `playbooks/gstack-workflow.md` (full ship pipeline), `playbooks/improver-workflow.md` (measured improvement loop).

## Anti-patterns to avoid

- ❌ Implementing before the contract test exists.
- ❌ Treating `/security-review` as optional on a backend diff.
- ❌ Editing an applied migration instead of adding a new one.
- ❌ Merging with red CI, or calling it shipped before `/canary` confirms the
  live endpoint answers.
