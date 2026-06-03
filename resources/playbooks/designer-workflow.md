# Playbook: Premium UI/UX pass (brand → layout → code → audit → polish)

Use when the user says "design this page", "make it Awwwards-level", "redesign
this", "turn this mockup into code", or wants a premium visual pass on a UI.
Follow the steps in order. The audit only bites if the brand and layout were
locked first.

## 1. Lock the brief (before any pixels)

- State VARIANCE / MOTION / DENSITY out loud and the one reference the look
  anchors to. If the user gave none, infer from the existing brand or ask.
- Run `/design-consultation` to pin the visual direction, target viewport, and
  the bar (Awwwards, clean SaaS, brutalist) as an explicit contract.
- **Verify:** the design language reads in one sentence and the user agrees
  with it.

## 2. Extract the style and brand system

- Run `/brandkit` to derive palette, type scale, spacing rhythm, and motion
  tokens from the brief or an existing site.
- When redesigning a live site, run `/redesign-existing-projects` to read the
  current source and surface what to keep vs. replace.
- **Verify:** tokens exist as named values (colors, type ramp, spacing units),
  not vibes in a paragraph.

## 3. Generate or refine the layout

- Run `/imagegen-frontend-web` (or `/imagegen-frontend-mobile` for mobile) to
  produce layout directions from the locked tokens.
- Want a stronger look? Run `/gpt-tasteskill` to push the variants past
  default toward the step-1 reference before you pick a winner.
- Lock ONE direction before writing code. Don't carry three half-layouts into
  step 4.
- **Verify:** one chosen layout exists, every section accounted for, no
  placeholder blocks left undesigned.

## 4. Review the layout before it becomes code

- Run `/plan-design-review` on the chosen direction. It rates each dimension
  0–10 and says what would make it a 10, while changes are still cheap.
- Fix the layout to clear the bar set in step 1 before any image-to-code.
- **Verify:** no dimension sits below the target score, and hierarchy and
  spacing read intentionally.

## 5. Convert image to code

- Run `/image-to-code-skill` to turn the locked layout into real components in
  the project's stack and conventions.
- For a new design dropped onto existing HTML markup, `/redesign-existing-projects`
  ports the new look onto the current structure.
- Match existing component patterns and naming. Read 2–3 neighbors first.
- **Verify:** the page renders in a browser at the target viewport and matches
  the chosen layout, with real content, not lorem ipsum.

## 6. Audit the live result and fix in place

- Run `/design-review` against the rendered page. It hunts spacing drift,
  hierarchy breaks, AI-slop patterns, and slow interactions, then fixes each in
  source and re-verifies with before/after screenshots.
- Visual claims need visual proof: confirm at the target viewport with a real
  screenshot or a computed-style measurement, not a read of the CSS.
- **Verify:** before/after screenshots show each flagged issue resolved, with
  no new regression introduced.

## 7. Polish to the Awwwards bar

- Tighten motion (purposeful only), micro-interactions, and the type rhythm
  against the step-1 reference. Re-run `/design-review` until it stops finding.
- Run `/code-review-deep` on the diff for correctness and reuse before landing.
- **Verify:** the page clears the bar named in step 1, the diff is review-clean,
  and a screenshot proves it.

**See also:** `playbooks/frontend-workflow.md` (ship the design in code).

## Anti-patterns to avoid

- Writing components before the brand tokens and layout are locked.
- Auditing with `/design-review` before the page actually renders. There's
  nothing to measure yet.
- Carrying multiple unfinished layout directions into image-to-code.
- Calling a visual change done by reading the CSS instead of viewing the
  rendered result at the target viewport.
- Decorative motion with no structural reason. Give it purpose or cut it.
