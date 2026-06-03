# Playbook: Ship an Infra / SaaS Ops Change (scope → guard → apply → canary → close)

Use when the user asks to change live infrastructure or a SaaS surface: a
deploy, a DNS record, an env var, an IAM policy, or a VPS rebuild, across AWS,
Vercel, Coolify, or Hostinger. The point is that you map blast radius BEFORE
you touch anything, and you carry a written rollback path the whole way.

## 1. Frame the change and its blast radius

- Name the surface (`deployment/*`, `hostinger/*`, AWS via `aws-cli`,
  `private/myvps`) and route by the persona's surface router. One surface leads.
- State what breaks if this goes wrong: which domain, which users, which
  dependent service. Run `/analyze` when the dependency chain isn't obvious.
- **Verify:** you can name the single worst-case outcome in one sentence.

## 2. Set the goal and the rollback path

- Run `/goal` to restate the change as a measurable check (a URL returns 200,
  a record resolves, a deploy is healthy) plus the runnable command that proves it.
- Write the rollback NOW, before applying: prior DNS record values, the last
  good Coolify deploy id, the prior env snapshot, the AWS resource state.
- **Verify:** the rollback step is written down, and you have dry-run it or
  walked the procedure step-by-step to confirm it works.

## 3. Lock secrets and least privilege

- Keep secrets in Coolify env or `secrets/envoult`, never in code or git.
- Audit any IAM or token grant for least privilege: no `*:*`, no `latest` tags.
  Route auth or input-handling diffs through `review/security-review`.
- **Verify:** no secret is about to land in a tracked file; the grant is scoped.

## 4. Guard the workspace before the destructive op

- Run `/careful` for the softer destructive bash guard, or `/guard <dir>` when
  the op touches prod (DNS edits, `s3 rm --recursive`, IAM deletes, VPS rebuilds).
- Confirm with the user before any production or irreversible step.
- **Verify:** guard is active and the user has given an explicit go-ahead.

## 5. Apply the change on the lead surface

- Container deploy or env change → `deployment/coolify` (or the `coolify` MCP).
- DNS, domains, TLS, shared hosting → `hostinger/dns`, `hostinger/domains`,
  `hostinger/hosting`.
- Self-hosted VPS → `hostinger/vps` or `private/myvps`.
- AWS resources → `aws-cli` (`aws-docs` MCP for syntax).
- Vercel → its plugin.
- Make one change, not a batch you cannot bisect. Capture the command output.
- **Verify:** the apply command exited clean and you saved its output.

## 6. Verify health against the goal check

- Run the Step 2 check now: hit the endpoint, resolve the record, read the
  deploy status. For DNS, warn the user about 5 to 60 minute propagation lag.
- Render the live URL with `/lightpanda` to confirm it actually loads.
- **Verify:** the goal check passes against the real, changed system.

## 7. Canary the live surface for a window

- Watch the changed surface for a short window: re-run the health check on an
  interval, tail Coolify logs, diff against the pre-change baseline.
- For UI surfaces, re-render with `/lightpanda` and scan for console errors or a
  broken render versus the baseline you captured in Step 5.
- **Verify:** no new errors or regressions appeared during the canary window.

## 8. Roll back or commit the record

- If the canary shows a regression, execute the Step 2 rollback immediately,
  then re-run Step 6's check to confirm recovery before debugging further.
- If healthy, record the change: update the Linear issue (`linear` skill),
  note the new baseline, and `/code-review-deep` any config or IaC diff.
- **Verify:** the surface is healthy and the change (or its reversal) is logged.

## 9. Reflect and close

- Run `/verify` on any decision-relevant claim you made about the live system.
- Note follow-ups: drift to reconcile, a manual step worth scripting, an alert
  worth adding. Close with a ranked Next steps block.
- **Verify:** open loose ends are written down, not left in your head.

**See also:** `playbooks/ship-feature.md` (ship code changes), `playbooks/improve-repo.md` (raise repo quality).

## Anti-patterns to avoid

- Applying before the rollback path is written. The rollback is step 2 for a reason.
- Batching DNS, env, and deploy changes so a failure can't be bisected.
- Calling it done on apply-success without the Step 6 health check passing.
- Skipping the canary window because the deploy "looked fine."
- Leaving a secret in a tracked file or granting `*:*` to move faster.
