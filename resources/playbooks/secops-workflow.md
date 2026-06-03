# Playbook: Security Audit and Pentest (scope → map → review → prove → report)

Use when the user says "audit this for security", "run a pentest", "OWASP
review", "threat model this", "harden the agent config", or otherwise asks to
find, prove, and rank security weaknesses end-to-end. Work the steps in order:
a finding you can't reproduce is a guess, and an unranked report buries the one
issue that matters.

## 1. Scope the engagement (before any probing)

- **Targets:** which services, endpoints, repos, agent configs are in bounds?
- **Out of bounds:** what must NOT be touched (prod data, third-party APIs)?
- **Goal:** find-and-report only, or find-and-fix?
- **Crown jewels:** which assets, if breached, hurt most? Rank the audit by these.

If the boundary is fuzzy, ask now. Probing an out-of-bounds target is the one
mistake you cannot take back.

- **Verify:** the trust boundary is named, in-bounds and out-of-bounds targets are written down, and no probe has started until scope is settled.

## 2. Map the attack surface

- Run `/analyze` for a grounded cross-file read of auth, input handling, and
  trust boundaries.
- Run `/health` to baseline repo quality and surface obvious smells.
- List every entry point: routes, webhooks, env reads, agent tool calls.
- **Verify:** every boundary where untrusted data enters the system is named and listed.

## 3. Run the OWASP/STRIDE review

- Run `/cso` for the OWASP Top 10 plus STRIDE pass on every auth- or
  input-touching path.
- For API surfaces, drive `review/api-tester` against each endpoint.
- Cross-check code patterns with `review/security-best-practices`.
- **Verify:** each OWASP category and STRIDE letter is marked covered or N/A with a reason, and no category is left unaddressed.

## 4. Harden agent config and secrets

- Run `security/agentshield` on the agent runtime: tool permissions, prompt
  trust boundaries, injection surface.
- Grep for hardcoded secrets, then confirm every secret reads from env or vault.
- For payment paths, check Stripe webhook signature verification.
- For data layer, check Supabase RLS, and run `/pnpm` to check supply-chain integrity.
- **Verify:** no secret sits in source, no tool grant is over-broad, and no webhook is unsigned.

## 5. Prove each finding

- Reproduce the issue: a request, a payload, or a test that triggers it.
- Run `/code-review-deep` on the suspect diff or module to confirm the root cause.
- Capture the evidence inline: the `file:line`, the failing curl, the log line.
- **Verify:** every finding has a working reproduction, and anything you cannot trigger is dropped or downgraded to "unconfirmed."

## 6. Rank by severity

- Run `/roi-estimator` to tag each finding with a severity dimension and a
  bounded impact percent, so the user sorts by blast radius, not by count.
- Map severity to crown jewels from Step 1: a prod-auth bypass outranks a
  cosmetic header gap.
- **Verify:** the list is ordered worst-first, and the top item names the asset at risk.

## 7. Report and remediate

- Write the report: finding, severity, evidence, concrete fix. No vague advice.
- If find-and-fix scope, take the top item first: smallest diff that closes it,
  re-run the Step 5 reproduction to confirm it no longer triggers.
- Run `/careful` or `/freeze <dir>` when the fix touches a live or prod path.
- Run `/verify` on the fixes, then ship the report and any patches with `/ship`.
- **Verify:** the Step 5 reproduction no longer triggers, the report names severity plus asset impact for each finding, and the patches are shipped.

**See also:** `playbooks/backend-workflow.md` (fix-then-ship loop)

## Anti-patterns to avoid

- Reporting a finding you never reproduced. Unproven means unconfirmed, say so.
- Probing a target before Step 1 settled what is in bounds.
- An unranked finding dump. Without severity the reader can't act.
- Echoing or logging a secret while proving the finding leaks it twice.
- Fixing a low-severity smell before the crown-jewel issue above it.
