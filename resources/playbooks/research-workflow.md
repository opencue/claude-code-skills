# Playbook: Source-Backed Research (scope → fan-out → cite → verify → synthesize)

Use when the user asks a question that needs an answer from outside this repo:
"research X", "what's the state of Y", "find me sources on Z", "is claim C
true". Run the steps in order. The discipline is: scope first, fan out wide,
cite everything, verify adversarially, then synthesize with confidence tags.

## 1. Scope the question

- Pin the deliverable: a decision, a comparison, a fact-check, or a survey?
- Name the unknowns that would change the answer (budget, region, version,
  timeframe). If 2+ are missing and the answer turns on them, ask before
  searching. One question beats a research pass aimed at the wrong target.
- Write the success check: the one sentence that, if sourced and verified,
  ends the research.
- **Verify:** you can state what answer would make the user stop asking.

## 2. Inventory what you already have

- Run `/find-skills` (research/find-skills) to surface the research skills that
  fit this topic before reaching for raw search.
- Run `/analyze` first to search this repo. Skip the web pass for any slice the
  repo already owns. Don't web-search what's already on disk.
- **Verify:** you know which skill owns each slice of the question.

## 3. Fan out across sources

- Spread queries across independent sources, not one engine rephrased. Vary the
  angle: primary docs, the original paper, a contrarian take, a dated source.
- Seed the query set with `/keyword-research` (research/keyword-research) so the
  fan-out covers the terms users actually search, not just your first phrasing.
- Use `/lightpanda` (the browser MCP) or `/scrape` (gstack/scrape) for pages
  that need a real DOM, and `/hackernews-frontpage` for current discussion.
- For market or forecast questions, pull `polymarket/polymarket-research` and
  `predict-everything/mirofish` for a priced or simulated view.
- **Verify:** every sub-question has at least two independent sources queued.

## 4. Extract and cite

- Pull each page through `/defuddle` (research/defuddle) or `/obscura` to strip
  it to clean text before reading. Don't reason over ad-wrapped HTML.
- For every claim worth keeping, capture the URL, the paper, or the data point
  next to it. A claim with no source is a note, not a finding.
- **Verify:** no claim sits in your notes without a source attached.

## 5. Verify claims adversarially

- For each load-bearing claim, search for the disconfirming source on purpose:
  the result that would prove it wrong, not the third that agrees.
- Cross-reference 2-3 independent sources before you let a finding stand as
  fact. One source is a lead, not a conclusion.
- Run `/liedetector` over the draft findings so each claim carries a 🟢🟡🟠🔴
  tag; `/integrity-tags` explains the scale if the user asks.
- **Verify:** the strongest claim survived an explicit attempt to break it.

## 6. Synthesize with confidence tags

- Structure the output: summary, findings, sources, confidence, gaps. Lead with
  the answer, then the evidence under it.
- Tag every finding by confidence and name the biggest limiter: what you could
  not source and what would change the conclusion.
- If the output is a list of options or recommendations, run `/roi-estimator`
  so the user ranks by impact, not by row count.
- Write the deliverable with `/document-generate` (gstack/document-generate)
  when it needs to be a shareable doc or PDF.
- **Verify:** a reader can act on the summary alone and trace every claim down.

## 7. Verify and close

- Run `/verify` on the decision-relevant claims. An independent pass catches
  what the author's eye skips. For a written artifact, `/code-review-deep` reads
  the doc the same way.
- Stop digging once deeper search stops moving the conclusion. Note the open
  gaps instead of padding.
- Close with `/next-steps`: the one follow-up worth running next.
- **Verify:** the success check from step 1 is met, with sources to prove it.

**See also:** `playbooks/improver-workflow.md` (rank findings by ROI).

## Anti-patterns to avoid

- Searching before scoping. A wide fan-out aimed at the wrong question wastes
  the whole pass.
- One source per claim. Cross-reference 2-3, or mark it unverified.
- Confirmation-only search. If you never looked for the disconfirming source,
  you didn't verify. You agreed with yourself.
- Findings with no confidence tag. An untagged claim reads as fact it hasn't
  earned.
- Padding the report after the conclusion stopped moving. Stop and ship the
  gaps as gaps.
