# Playbook: Medusa v2 Feature Workflow (module → migration → admin/storefront wiring → seed → test)

Use when the user asks for a Medusa v2 change that spans the stack: a new
module or migration, admin/storefront wiring, then seed and shop setup.
Examples: "add a wishlist module", "expose this in admin and the storefront",
"new product type with custom fields". Follow the order: schema before
wiring, wiring before seed, seed before flow testing.

## 1. Frame the contract (before any code)

- State inputs, outputs, and the one acceptance check that proves the flow
  works end-to-end (e.g. "wishlist item shows in admin AND on the storefront").
- Name which entities, regions, and providers the flow depends on.
- If anything is ambiguous, ask one focused question now.
- **Verify:** the acceptance check is written as a single runnable assertion.

## 2. Confirm the API surface

- Load `/medusa/medusa-reference` to confirm the module service, workflow, and
  JS SDK methods the change touches. Don't guess endpoint or service shapes.
- For a dependency's real internals, fetch it with `opensrc` rather than
  reading types alone.
- **Verify:** every method you plan to call is named in the reference.

## 3. Build the module

- Follow `/medusa/building-with-medusa` for the module: service, models, and
  links. Customizations go through a module, never a core monkey-patch.
- Keep the diff to the one module. Run `/freeze <module-dir>` if the blast
  radius is wide.
- **Verify:** the module loads with no import or registration error.

## 4. Generate and apply the migration

- Run `/medusa/db-generate` to produce the migration from your model changes.
- Read the generated SQL before applying. Confirm it matches intent, no
  accidental drops. Then run `/medusa/db-migrate`.
- **Verify:** the migration applies clean and the new columns/tables exist in
  the DB.

## 5. Wire the admin

- Extend admin through widgets and routes per
  `/medusa/building-admin-dashboard-customizations`. Don't fork the admin.
- Generate the widget under `src/admin/widgets/` and export the
  `defineWidgetConfig` zone so it mounts on the target page.
- Register any custom admin route under `src/admin/routes/` and call the new
  module's service through the admin API, not a direct DB read.
- Run the admin locally (`medusa develop`) and load the page that hosts the
  widget.
- **Verify:** the widget/route renders in the running admin and reads/writes
  the new module data.

## 6. Wire the storefront

- Talk to Medusa through the JS SDK only, following
  `/medusa/building-storefronts` and `/medusa/storefront-best-practices`. Never
  raw-fetch `/store/*`.
- Fetch the new data with the SDK client (`sdk.store.*`) in a server
  component or loader, not inline in a client render.
- Keep server-fetched data in the page's data layer and pass it down; hold only
  interactive UI state on the client.
- Render the affected page with `/lightpanda` (or open it in a browser) to
  inspect the output.
- **Verify:** the new data appears on the rendered storefront page.

## 7. Seed and run locally

- Start the backend + storefront with `/medusa/medusa-local-dev` (handles
  per-shop ports and collisions), then seed real data with `medusa seed`. For a
  shop that isn't scaffolded yet, `/medusa/medusa-shop-setup` stands up the base
  template, envs, and storefront before you seed regions, shipping, and payment
  providers.
- Create an admin with `/medusa/new-user` (first) or `/medusa/new-admin-via-api`
  (additional) if you need login.
- **Verify:** the app boots and seed data loads with no error.

## 8. Test the end-to-end flow

- Exercise the acceptance check from step 1 against the running app: admin write
  reflects on the storefront, SDK call returns the expected shape.
- Restate it as a measurable goal with `/goal` so the check is runnable, not a
  vibe. If a step breaks, run `/investigate` for the root cause. No fix without
  one.
- **Verify:** the acceptance assertion passes against the running app.

## 9. Review the diff

- Run `/code-review-deep` on the full diff before landing. It catches SQL
  safety, migration completeness, and trust-boundary gaps the seed test won't.
- Fix every CRITICAL/HIGH finding and re-run the relevant check.
- **Verify:** the review returns no open CRITICAL/HIGH findings.

## 10. Commit and close

- Commit with `/caveman-commit`: intent-first subject, body explains
  the why. Checkpoint with `/checkpoint` if the change is large.
- Run `/verify` for decision-relevant claims, then close with a ranked
  `/next-steps` block.
- **Verify:** tests, migration, and build are all green before you call it
  done.

**See also:** `playbooks/backend-workflow.md` (module/migration depth), `playbooks/designer-workflow.md` (storefront visual QA).

## Anti-patterns to avoid

- ❌ Editing a migration after it's applied. New schema change, new migration.
- ❌ Raw-fetching `/store/*` from the storefront instead of the JS SDK.
- ❌ Forking the admin instead of using widgets and routes.
- ❌ Testing a flow before seeding regions, shipping, and payment providers.
- ❌ Running `/code-review-deep` after the commit lands instead of before.
