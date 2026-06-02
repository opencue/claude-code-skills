# cue launch kit

Drafts, checklists, and copy-paste templates for getting cue in front of people.
Everything here is intended to be edited before sending — they're starting points,
not final copy.

## Channels in order of leverage

| File | Channel | One-shot or recurring | Effort | Estimated reach |
|---|---|---|---|---|
| [`awesome-lists.md`](./awesome-lists.md) | GitHub awesome-* PRs | one-shot per list | low | durable, compounds for years |
| [`show-hn.md`](./show-hn.md) | Hacker News Show HN | one-shot | medium | massive spike if it lands; window matters |
| [`reddit.md`](./reddit.md) | r/ClaudeAI, r/LocalLLaMA, r/programming | monthly | low | steady trickle |
| [`twitter-threads.md`](./twitter-threads.md) | X / Twitter | per release | low | depends on follower size |
| [`anthropic-outreach.md`](./anthropic-outreach.md) | Anthropic devrel | drip | high | huge if you land it |
| [`plugin-marketplace.md`](./plugin-marketplace.md) | Claude Code plugin marketplace | one-shot | medium | depends on marketplace traffic |
| [`repo-owner-followup.md`](./repo-owner-followup.md) | Gem-owner GitHub issues (30-day follow-up) | recurring | low (automated) | turns indexed repos into evangelists |

## Recommended sequencing

1. **Week 0**: ship awesome-list PRs + Twitter thread for current release
2. **Week 1**: Reddit posts in 2 subs (don't blast all at once)
3. **Week 2**: polish README + demo cast, then Show HN
4. **Week 4+**: Anthropic outreach (after Show HN has generated some social proof)
5. **Ongoing**: plugin marketplace once ready; followup template auto-runs nightly

## What's already automated

- ✅ Nightly GitHub discover scan → per-profile SEO pages → published to GitHub Pages (`discover-publish.yml`)
- ✅ Nightly `discovered.md` refresh + commit (`discover-refresh.yml`)
- ✅ Per-repo backlink loop via `cue discover install --notify`
- ✅ Daily digest discussion in opencue/cuecards via `cue discover install --digest`

## What this kit does NOT cover

- Paid acquisition (ads, sponsorships) — out of scope for an MIT CLI
- Influencer outreach — content-first instead
- Conference talks — earn the social proof first

## Metrics to watch

- npm downloads on `cue-ai` (weekly trend)
- GitHub stars (daily delta)
- `opencue.github.io/cue/` page views (Google Search Console)
- Discoveries posted to GitHub Discussions
- README badge embeds across discovered repos (`gh search "img.shields.io/badge/cue"`)
