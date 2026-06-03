# Playbook: Ship a growth asset (brief → research → draft → anti-slop → ship + measure)

Use when the user says "write this post", "draft an article", "build a
landing page", "make a campaign", or otherwise asks for a marketing or growth
asset that goes out to an audience. Follow the steps in order. Skipping the
research or the anti-slop gate is how slop ships.

## 1. Pin the brief (before any research)

- **Goal:** what action should the reader take, as one measurable metric?
- **Audience:** who is this for, and where do they already hang out?
- **Surface:** blog, Postiz social, paid ad, email, or landing page?
- **Brand:** read the brand kit first; voice and claims inherit from it.

If the goal or audience is vague, ask before researching. A sharp brief
costs one question; a wrong audience wastes the whole draft.

- **Verify:** the brief names a measurable goal, a specific audience, and a surface.

## 2. Research the audience

- Run `/icp-research-assistant` to turn the brief into a named ICP with pains,
  objections, and the language they actually use.
- **Verify:** the ICP names a specific person and a specific trigger, not "everyone
  interested in X".

## 3. Mine keywords and GEO intent

- Run `/keyword-research` for the seed terms, search intent, and clusters.
- For answer-engine and generative-search reach, layer in
  `/geo-content-optimizer` or `/generative-engine-optimization`.
- **Verify:** you have a primary term, 3-5 supporting terms, and the intent
  (informational / commercial / transactional) named for each.

## 4. Draft the copy

- Pick the writer by surface: `/article-writer` for blog and long-form,
  `/email-sequence-writer` for email, `/ad-copy-variant-generator` for paid.
- Feed it the ICP and the keyword cluster from steps 2-3, not a cold prompt.
- **Verify:** every section maps to a reader pain or a keyword from the research,
  with no filler paragraphs that serve neither.

## 5. Run the anti-slop gate

- Run `/stop-slop` to catch AI tells, hedging, and em-dash sprawl.
- Run `/anti-formula` to break the predictable listicle / "in today's world"
  skeleton.
- Rewrite until both pass threshold. **Do not surface a draft that fails the
  gate.** Score below the line means rewrite, not ship.
- **Verify:** both `/stop-slop` and `/anti-formula` clear threshold before the draft advances.

## 6. Wire tracking before ship

- Run `/utm-tracking-generator` for every outbound link so the measure step has
  clean attribution.
- For landing pages, run `/landing-page-audit` on the destination first.
- **Verify:** each link carries source / medium / campaign and resolves with no
  redirect chain.

## 7. Review the asset

- Run `/code-review-deep` when the asset touches code (landing page, tracking
  snippet, schema markup).
- Run `/api-tester` against any tracking endpoint or webhook the asset posts to.
- **Verify:** no broken links, no leaked draft copy, no hardcoded tracking IDs.

## 8. Ship it

- Run `/ship` for repo-backed assets (landing pages, committed content).
- For social, schedule through Postiz only after the brand and account are
  confirmed and the user says yes.
- **Verify:** the asset is live (or scheduled) and the URL / post resolves.

## 9. Measure and decide

- Run `/landing-report` for landing-page performance, `/ab-test-setup-and-analysis`
  when two variants are live, and read GA4 through the analytics MCP for traffic.
- **Verify:** the goal metric from step 1 has a number, and you state keep / iterate /
  kill based on it, not a vibe.

**See also:** `playbooks/improver-workflow.md` (measure-driven iteration loop)

## Anti-patterns to avoid

- Drafting copy before the ICP and keyword research exist.
- Shipping a draft that failed `/stop-slop` or `/anti-formula`.
- Posting to social before the brand kit and account are confirmed.
- Calling it done at ship. The asset is not done until the goal metric reads.
- Mutating ad or analytics accounts via MCP; those report, the user changes
  in the UI.
