# Playbook: Build a Python API Endpoint (contract → test-first → implement → gate → ship)

Use when the user asks to add or change a FastAPI/Django/Flask endpoint backed
by a SQLAlchemy/Alembic model: "add a POST /orders route", "expose a new
resource", "wire this table to the API". Follow the steps in order. Skipping
ahead is how a route ships with no migration or an untested model.

## 1. Pin the contract with /goal

- Restate the endpoint as a measurable goal: method + path, request shape,
  response shape, status codes, auth boundary.
- Name the one acceptance assertion (e.g. `POST /orders returns 201 + the row`).
- Run `/goal` so the success check is runnable, not a vibe.
- Modifying an existing endpoint? Document the breaking change and the
  deprecation window as part of the `/goal` so the contract shift is explicit.
- **Verify:** the passing assertion is stated in one sentence.

## 2. Read the seam with /analyze

- Read the 2-3 existing routers, models, and test modules nearest to this work.
- Match the project's layer split (router → service → repository), Pydantic
  schema location, and session-handling pattern before adding anything.
- Use `/analyze` for a grounded cross-file read when the layout is unfamiliar.
- **Verify:** the file each new piece (route, model, schema, test) lands in is
  named.

## 3. Model the data, then generate the migration

- Add or edit the SQLAlchemy model with type-annotated columns.
- Autogenerate: `alembic revision --autogenerate -m "add <table>"`.
- Read the generated migration. Confirm it matches the model. Autogenerate
  misses server defaults, enum changes, and index renames. Edit before applying.
- Apply to a scratch DB: `alembic upgrade head`, then `alembic downgrade -1` to
  prove the rollback works.
- **Verify:** `upgrade head` then `downgrade -1` both run clean.

## 4. Write the failing pytest first

- Write the test against the test client (`TestClient` / `AsyncClient`) for the
  endpoint, plus a model/repository test if there's non-trivial query logic.
- Use fixtures and `parametrize` for the edge cases named in step 1.
- Run it: `pytest path/to/test_x.py -x`. Confirm it fails because the feature is
  absent, not from an import error or typo.
- **Verify:** the test fails because the feature is absent, not from an import
  error or typo. That failure is the goalpost.

## 5. Implement the smallest green slice

- Add the Pydantic request/response models at the boundary.
- Write the route, service, and repository code, inline first, extract only
  when a second caller appears. No config knobs that weren't asked for.
- Async for I/O-bound handlers, sync for CPU-bound.
- Run the test from step 4 until green.
- **Verify:** the step-4 test passes.

## 6. Exercise the live route with api-tester

- Boot the app and hit the real endpoint with `/api-tester` (or `curl` /
  `httpie`): happy path, one validation failure, one auth-denied case.
- Confirm status codes and the error body shape match the step-1 contract.
- **Verify:** the live response matches the contract, not just the mock.

## 7. Verify the full gate at 80% coverage

- Run the whole suite with coverage: `pytest --cov=<pkg> --cov-report=term-missing`.
- Coverage on touched modules must clear 80%. Fill gaps the report names;
  don't pad with assertion-free tests.
- Lint and typecheck: `ruff check .` and `mypy <pkg>` (or the project's
  equivalent).
- **Verify:** suite green, coverage ≥ 80% on changed files, ruff + mypy clean.

## 8. Review the diff before landing

- Run `/code-review-deep` on the working-tree diff. It catches SQL-injection
  surface, missing parameter binding, session leaks, and enum gaps.
- For auth, input-handling, or secrets changes, run `/verify` to escalate the
  decision-relevant claims to an independent pass.
- Fix every CRITICAL/HIGH finding or state why it's a false positive.
- **Verify:** no open CRITICAL/HIGH findings.

## 9. Ship it

- `/caveman-commit` writes the Conventional Commit. Subject names the capability; body
  explains the user need, not the diff.
- `/ship` runs the merge-base sync, full test gate, and opens the PR.
- Note the applied migration in the PR body so the deployer runs `upgrade head`.
- **Verify:** PR open, CI green, migration step called out.

**See also:** `playbooks/backend-workflow.md` (framework-agnostic API flow), `playbooks/improver-workflow.md` (measured improvement loop).

## Anti-patterns to avoid

- Writing the route before the migration exists, then discovering the table
  isn't there.
- Trusting `alembic --autogenerate` without reading the diff. It misses
  defaults, enums, and index renames every time.
- Hitting 80% coverage with tests that assert nothing. Coverage is a floor on
  real assertions, not a number to game.
- Skipping the live api-tester pass because the unit test is green. The test
  client mocks the wire; production does not.
- `git push` straight to the trunk. Use `/careful` or `/freeze` when the blast
  radius touches migrations or shared models.
