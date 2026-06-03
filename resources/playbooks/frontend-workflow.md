# Playbook: Frontend UI implementation / redesign (read seam → build → screenshot → visual + a11y → verify)

Use when the user says "build this component", "redesign this page", "match this
mockup", "implement the Figma", or otherwise asks for UI work that has to look
right on screen, not just compile. Follow the steps in order. The screenshot
gate is what separates "renders" from "done".

## 1. Read the seam (where the UI lives)

- Open the 2-3 components that already do similar work and match their style:
  prop typing, loading/error states, CSS scope (Module / Tailwind).
- Run `/analyze` when the layout or data flow spans files and you need a
  grounded read before touching anything.
- Note the target viewport(s) the change is judged at: mobile (390px), desktop
  (1280px+), or both. Write it down; you screenshot there later.
- **Verify:** you can name the existing pattern you're extending, not inventing.

## 2. Lock the visual target

- For a redesign or new look, run `/design-taste-frontend` to set the bar, or
  `/image-to-code` when the user handed you a mockup/screenshot to match.
- For a fresh look with options, run `/ui-ux-pro-max`; for a stripped, restrained
  direction run `/minimalist-ui`.
- State the acceptance property in one line: "the card matches the mockup at
  390px and 1280px, AA contrast, keyboard-reachable."
- **Verify:** the target is a checkable property, not a vibe.

## 3. Build the component (smallest version that renders)

- Explicit prop types, no `any`. Handle loading and error states up front, not
  as a follow-up.
- Guard against hydration mismatch: anything reading `window`, `Date.now()`, or
  `Math.random()` at render time is suspect.
- Resist abstraction. Inline first, extract only when a second caller appears.
- **Verify:** typecheck and build pass for the file you touched.

## 4. Screenshot at the target viewport

- Drive a real browser with `/playwright` (or the `playwright` MCP) and capture
  the component at each viewport from step 1.
- Use `/screenshot` for a quick single-frame grab when you just need one shot.
- Reading the JSX/CSS is NOT visual verification. You confirm against pixels,
  not source.
- **Verify:** you have a screenshot at each target width on disk.

## 5. Visual + accessibility pass

- Compare the screenshot against the step-2 target: spacing, hierarchy,
  alignment, color, responsive behavior.
- Verify every interactive element has a role, label, and keyboard path; confirm
  AA contrast. Drive the focus order with `/playwright` to prove tab reaches it.
- Measure, don't eyeball, when the claim is "spacing is right": pull
  `getBoundingClientRect()` / `getComputedStyle()` and quote the value.
- **Verify:** the visual claim cites a measured value or a before/after frame.

## 6. Verify against the design and fix the gaps

- List each diff between render and target as its own fix. If there are 3+,
  rank them with `/roi-estimator` and do the highest-impact first.
- Apply the smallest diff per gap, then re-screenshot. Don't batch-fix blind.
- Re-run `/playwright` focus + contrast checks after the last fix.
- **Verify:** the screenshot now matches the target; no a11y regression.

## 7. Review and commit

- Run `/code-review-deep` on the diff before calling it done; run `/verify` when
  a decision-relevant claim needs an independent pass.
- Commit with `/caveman-commit` (Conventional Commits). Body explains the
  user-facing why, not the diff.
- Tell the user what shipped in one sentence plus how to see it: the URL and the
  viewport to open.
- **Verify:** review is clean and the commit is pushed.

## Safety rails (optional, any time)

- `/freeze <dir>` locks edits to the component dir so a redesign doesn't drift
  into unrelated files. `/unfreeze` to release; `/guard <dir>` for both rails.
- `/careful` blocks softer destructive shell during edits.

**See also:** `playbooks/designer-workflow.md` (visual taste pass), `playbooks/backend-workflow.md` (API the UI consumes).

## Anti-patterns to avoid

- Calling the UI done from reading the CSS when you never opened a browser.
- Screenshotting at one width when the target said mobile AND desktop.
- Treating accessibility as a later ticket instead of a step-5 correctness bar.
- Batch-fixing five visual gaps, then screenshotting once and hoping.
- "While I'm here" refactors riding along on a visual diff.
