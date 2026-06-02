# Anthropic devrel outreach

The prize: a link from Anthropic's official Claude Code docs, blog, or social
to cue. That's worth roughly 6–12 months of organic growth in one event.

**Hard. Slow. Drip-first.** Don't ask cold.

## Phase 0 — earn the right to ask (3–6 months)

Before any outreach, cue needs to look like a project worth amplifying. Specifically:

- [ ] ≥500 GitHub stars
- [ ] Active commits (≥1 per week, ideally per day via the auto-discover loop)
- [ ] Show HN past first page OR equivalent public moment
- [ ] At least 2 awesome-list inclusions
- [ ] 5+ external contributors (PRs merged)
- [ ] README is clean, install works on a fresh machine, no broken links
- [ ] You've publicly used cue in your own posts/projects so there's a paper trail

If any of those is missing, fix that first. Anthropic's devrel team gets pitched
constantly — they only look at projects that already have traction.

## Phase 1 — passive surface area (drip)

These are things you do without asking for anything. Each one creates a paper
trail Anthropic's team will eventually see.

- **Contribute to anthropics/cookbook**: PR a notebook that uses cue.
- **Engage on Anthropic's official Discord** (`#claude-code` channel): help
  people, mention cue only when it actually solves their problem.
- **Cite Anthropic docs in cue's own docs**: link to Claude Code docs from
  cue's README, link to MCP spec from cue's MCP docs. Reciprocity matters.
- **Tag @AnthropicAI in tweets** that show real users solving real problems
  with cue + Claude Code together (not "look at cue!").
- **Reply thoughtfully to Anthropic's blog posts** (in the comments or
  on Twitter) when they're relevant to skills/MCPs/profiles.

## Phase 2 — the email (after Phase 0 + 1 are real)

Anthropic's devrel emails: `devrel@anthropic.com` (general), or find a
specific person on the Claude Code team via their public LinkedIn or
GitHub profile.

**Subject**: `cue — open-source agent profile manager for Claude Code & Codex`

**Body**:

```text
Hi [Name],

I'm the maintainer of cue (github.com/opencue/cuecards), an open-source profile
manager for Claude Code and Codex CLI. It's early but growing — currently at
[N] stars, [N] npm weekly downloads, and the discovery engine has indexed
~360 community-built skill repos that I think your
docs team would find useful.

A few specific reasons I'm reaching out:

1. Cue's discover engine is the closest thing to an index of Claude Code skills
   on the open web. The per-profile pages (opencue.github.io/cue/discovered/)
   are cited by Perplexity, ChatGPT search, and Google AI Overviews when users
   search for "Claude Code skills for X". Happy to share traffic data.

2. We auto-open low-pressure issues on indexed skill repos with a "you were
   added to cue's discovery index" notification (one per repo, ever, opt-out by
   close). Maintainers have generally been positive — [N]% have added the cue
   badge to their READMEs.

3. If there are skills Anthropic publishes (e.g., the anthropics/skills repo),
   I'd love to feature them at the top of the discover results. Today they're
   ranked alongside community repos by signal quality only; an official-source
   bump would help users distinguish.

Two things I'm hoping to ask:

- Would you consider linking to cue from the Claude Code skills docs, even
  as a "community projects" section? Happy to write the doc PR.
- Could I run early discovery rules past your team before publishing? Avoids
  surprising your devs if cue starts surfacing low-quality skills under their
  brand.

No urgency. Happy to chat on a call or async. Thanks for reading this far.

[Your name]
[GitHub handle]
```

## Phase 3 — what to ask for, ranked

| Ask | Likelihood | Value |
|---|---|---|
| Link from Claude Code docs "community projects" section | high | huge |
| Quote / tweet from official @AnthropicAI | medium | huge spike |
| Feature in monthly devrel newsletter | medium | sustained |
| Live demo at an Anthropic event | low | huge if landed |
| Official partnership / co-marketing | very low | massive but unrealistic |

Lead with the LOW-effort high-likelihood asks. Save the bigger asks for
after the first ones succeed.

## Anti-patterns to avoid

- ❌ Mass-emailing Anthropic employees — devrel team will hear about it
- ❌ DMing people on Twitter cold — basically zero hit rate, slightly negative
- ❌ Tagging in posts that demand response ("@AnthropicAI please review this!")
- ❌ Framing cue as competitive to anything Anthropic ships
- ❌ Asking for free credits / API access in the same email as the partnership ask

## If you don't hear back

That's the default. ~80% of cold devrel outreach gets no reply. Strategy:

- Wait 4 weeks
- One polite follow-up referencing one new piece of social proof since the original
- If still no reply: drop it; double down on Phase 1 (passive surface area) and
  try again in 3-6 months
