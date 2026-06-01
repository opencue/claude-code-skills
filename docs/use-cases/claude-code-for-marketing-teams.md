# Claude Code for marketing teams — copywriting, SEO, CRO, content production with cue

_Last updated: 2026-05-24_

**Short answer:** Run `cue use marketing` in your content/marketing project to load **42 marketing skills** across 7 pods (content, SEO, CRO, channels, growth, intelligence, sales) — copywriting, content production, content humanizer, SEO audit, AI SEO (GEO), schema markup, popup CRO, signup-flow CRO, paywall CRO, cold email, email sequences, paid ads, social media, ad creative, marketing psychology, pricing strategy, and 25 more.

This is the official cue profile for marketing teams using Claude Code.

---

## What you get

| Pod | Skills |
|---|---|
| **Content** | content-production, content-strategy, content-humanizer, copywriting, copy-editing |
| **SEO** | seo-audit, ai-seo (GEO for ChatGPT/Perplexity), schema-markup, site-architecture, programmatic-seo |
| **CRO** | page-cro, popup-cro, form-cro, signup-flow-cro, onboarding-cro, paywall-upgrade-cro |
| **Channels** | paid-ads, ad-creative, social-content, x-twitter-growth, social-media-manager, cold-email, email-sequence |
| **Growth** | marketing-ideas, marketing-psychology, launch-strategy, referral-program, free-tool-strategy |
| **Intelligence** | competitor-alternatives, campaign-analytics, social-media-analyzer, analytics-tracking, marketing-context |
| **Sales** | marketing-strategy-pmm, marketing-demand-acquisition, marketing-ops, prompt-engineer-toolkit |

---

## Quickstart

```bash
# 1. Install cue
npm install -g cue-ai

# 2. Pin the marketing profile to your content repo
cd ~/work/q4-product-launch
cue use marketing

# 3. (Optional) Set up your brand voice once
echo "Run marketing-context to lock in target audience + brand voice" > .claude-todo

# 4. Launch
claude
```

Inside the session:

- *"Write the homepage hero section for our pricing-page redesign"* → copywriting + brand-guidelines
- *"Optimize this blog post for ChatGPT citation"* → ai-seo (Generative Engine Optimization)
- *"Draft a 6-email nurture sequence for trial users"* → email-sequence
- *"Build an exit-intent popup for the checkout abandon flow"* → popup-cro
- *"Compare us against [competitor] for a switch landing page"* → competitor-alternatives
- *"Estimate ROAS for the LinkedIn campaign with these metrics"* → campaign-analytics
- *"Make this AI-written copy sound more human"* → content-humanizer

---

## Why cue (vs global Claude Code)

**Without cue:** Your marketing session also loads cybersecurity skills, frontend skills, Rust skills — Claude picks `nmap` when you ask for a "scan" of your funnel. The everything-loadout (`full`) is ~81k always-on tokens — **~$24 / 100 msgs**.

**With cue and the marketing profile:** Only marketing skills load. The model never confuses "scan the funnel" with "scan with nmap". ~13k always-on tokens — **~$3.96 / 100 msgs** (`cue cost marketing`).

Plus: profile-scoped MCPs mean your marketing analytics tools don't pollute non-marketing sessions.

---

## Per-channel content production

cue's marketing profile is built around the marketing-skills team's **42-skill ecosystem** (7 pods × 27 Python tools). The skills are designed to compose — `marketing-ops` is the router that picks the right specialist; `marketing-context` runs first to lock in audience + brand voice across every subsequent skill.

Typical workflow:

```bash
# 1. Set context once per project
> Use marketing-context to set up target audience, ICP, and brand voice for [product]

# 2. Plan
> Use content-strategy to plan a topic cluster for our Q4 push

# 3. Write
> Use content-production to draft 3 blog posts from that plan

# 4. Optimize
> Use ai-seo to make each post citeable by ChatGPT and Perplexity

# 5. Distribute
> Use social-content to repurpose each post into a LinkedIn carousel + X thread
```

---

## Safety + quality

The `marketing` profile inherits from `core`, so you get the same safety hooks (bash-preflight, secrets-guard, commit-message-guard, session-summary) as every other cue profile. Plus:

- **Commit-message-guard** keeps your content-repo commits clean — no `git commit -m "update"` 200 times a day
- **Session-summary hook** logs every session end, feeding the failure-feedback loop. Run `cue failures --propose marketing` weekly to ask Claude what to add to the profile.

---

## Find more marketing skills

```bash
cue marketplace discover --cli-aware --limit 30
#   →  marketing, frontend matches show up first because their keyword index
#      maps to your active profile
```

The discovery flow uses GitHub Code Search + path/keyword matching to find marketing-relevant skill repos and rank them by profile fit.

---

## See also

- [Glossary](../glossary.md) — Skill, MCP, Profile defined
- [Claude Code for cybersecurity](./claude-code-for-cybersecurity.md) — companion use-case page
- [Reduce Claude Code token cost](./reduce-claude-code-token-cost.md) — the numbers behind the savings
- [marketing-skills upstream](https://github.com/JonasGroenbek/marketing-skills) — the 42-skill collection cue loads
