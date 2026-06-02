# Repo-owner 30-day follow-up

After we open an issue on a discovered repo via `cue discover install --notify`,
some maintainers add the cue badge to their README and become evangelists. A
30-day follow-up converts more of them.

## What the follow-up does

For each entry in `~/.config/cue/discover-notified.json` older than 30 days
where the issue is still **open** (not closed = opt-out):

1. Re-score the gem
2. Comment on the existing issue (no new issue created)
3. Thank the maintainer for being indexed
4. Show stats: their gem's current rank in the profile, install counts if
   tracked, README badge embed count across cue's own discoveries
5. Offer to feature the gem in cue's docs / a tweet / the next digest

## Trigger

```bash
cue discover followup                  # interactive, asks per-gem
cue discover followup --dry-run        # preview comment body, no posts
cue discover followup --max 5          # cap to N comments per run
cue discover followup --yes --max 5    # auto-post (CI-friendly)
```

This subcommand is implemented in `src/commands/discover.ts` (see the
`cmdNotify` block — the `followup` route mirrors it but uses `gh issue comment`
instead of `gh issue create`).

## Comment template

```markdown
> Following up — your repo has been in cue's discovery index for 30 days.

<p align="center">
  <img src="..." alt="score badge">&nbsp;
  <img src="..." alt="stars badge">&nbsp;
  <img src="..." alt="profile badge">
</p>

### Current standing in cue

- **Profile**: `{profile}` (rank: **#{rank}** of {total})
- **Score**: {score} → {tier}
- **Stars since indexing**: +{delta} (currently {stars}★)
- **Indexed activity**: {N} cue users have run `cue discover install {full_name}` in the last 30 days

### Anything we can do?

- 🎁 Feature your repo in cue's next [Twitter release thread](https://twitter.com/...) or [GitHub Discussion digest](https://github.com/opencue/cuecards/discussions)?
- 🔧 Wire any specific CLIs your skill needs into `cue cli install`?
- 📝 Help draft a tighter `SKILL.md` description for cue's discovery page?

Just reply here, or open a PR on `opencue/cuecards` — happy to collaborate.

---

<sub>Auto-comment from `cue discover followup`. One follow-up per repo per quarter, ever.</sub>
```

## Cadence + rate limits

- **One follow-up per repo per quarter** (90 days since last comment from us)
- **Daily limit**: 10 comments per day across all repos (vs the 15 hard limit for new issues)
- Tracked in the same `~/.config/cue/discover-notified.json` under a `followups` key

## Anti-spam guardrails

- Don't comment if the issue is closed (= they opted out)
- Don't comment if there's been other recent activity (last 7 days) — would look intrusive
- Skip if the repo has been archived or made private
- Skip if maintainer has previously commented "please stop" or similar

## Manual override

For high-value repos (★≥500 or curated picks), the follow-up should be
hand-written, not templated. The auto-followup just identifies candidates;
real outreach uses the candidate list as input:

```bash
cue discover followup --list-candidates  # prints repos due for followup
# then hand-write per repo
```
