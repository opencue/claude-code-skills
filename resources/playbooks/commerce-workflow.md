# Playbook: Full-stack commerce change (contract → model → wire → pay → ship)

Use when a change spans the whole stack (a new product field, a checkout
tweak, a payment behavior) touching Medusa v2 backend, the Vite + TanStack
storefront, and Stripe. Work bottom-up: model first, payment last. Skipping a
layer is how carts charge the wrong amount.

## 1. Pin the contract across all three layers

- Write the contract before any code: the data shape (model field/table),
  the backend route signature, the storefront surface, and the payment
  path it affects (charge / refund / webhook). For a larger or fuzzy
  change, run `/autoplan` to force the design questions first.
- Name the acceptance test up front: the one order flow that, if it
  completes and charges correctly, proves the change works end-to-end.
- **Verify:** the contract names a concrete data shape, a route, a UI surface,
  and a Stripe outcome before any code.

## 2. Model the data and migrate forward

- Edit the Medusa module model, then `db:generate` to produce the migration,
  then `db:migrate` against local Postgres. Migrations are forward-only.
- Never patch Medusa core. Model changes live in your module.
- **Verify:** `db:migrate` exits clean and the new column/table shows in the
  local DB. Confirm before running migrate against any shared DB.

## 3. Build the backend module and route

- Add the service method and the API route in the Medusa module per
  `medusa/building-with-medusa`. Keep the route thin, push logic to the service.
- Validate every inbound field at the route boundary. Never trust the
  storefront payload.
- **Verify:** the route returns the expected JSON for one happy-path and one
  bad-input case.

## 4. Wire the storefront

- Add the TanStack loader and the typed fetch to the new route; render the
  surface and route cart state through TanStack Query per
  `medusa/building-storefronts`.
- Match the existing loader and component style before inventing a new pattern.
- **Verify:** the new data renders and the cart reflects it on page load.

## 5. Wire and verify the payment path

- Implement the Stripe step per `stripe/stripe-best-practices`; handle the
  matching event in `stripe/stripe-webhooks`. Use test keys only.
- Confirm idempotency: a replayed webhook must not double-charge or
  double-fulfill.
- **Verify:** one full checkout completes in Stripe test mode, the webhook
  fires, and the order reaches the correct state.

## 6. Review the diff before landing

- Run `/code-review-deep` on the full diff across all three layers.
- Run `/cso` when the change touched payment, auth, secrets, or user input.
  Stripe and order data both qualify.
- **Verify:** no CRITICAL or HIGH findings open; secrets stay in env, never in code.

## 7. Check repo health and ship

- Run `/health` for the type/lint/test composite, then `/ship` to commit,
  bump, and open the PR.
- Body explains the why (the order-flow need) over the what.
- **Verify:** `/health` holds or improves and the PR opens green.

## 8. Watch the live checkout after deploy

- After merge, run `/canary` to watch the storefront for console errors and
  page failures, with eyes on the checkout and payment screens.
- **Verify:** one real test order completes on the deployed site and the canary
  reports no regression.

## When it breaks instead of builds

- Wrong charge, failed webhook, order stuck: run `/investigate` first. No fix
  without a root cause; a null-check on the symptom is not the fix.
- Guard live work: `/careful` before destructive bash, `/guard <dir>` when the
  blast radius reaches prod DB, env, or `sk_live_` keys.

**See also:** `playbooks/medusa-dev-workflow.md` (Medusa backend loop), `playbooks/backend-workflow.md` (service and route patterns)

## Anti-patterns to avoid

- ❌ Editing the storefront before the route returns the new shape. You build
  against a contract that doesn't exist yet.
- ❌ Testing payment against live Stripe keys. Test mode proves the flow; live
  mode proves the incident.
- ❌ Shipping without re-running the full checkout. Unit tests pass while the
  end-to-end order silently charges wrong.
- ❌ Patching Medusa core instead of the module. The next upgrade erases it.
