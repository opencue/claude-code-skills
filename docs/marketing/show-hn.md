# Show HN draft

## When to fire

- **Day of week**: Tuesday, Wednesday, or Thursday
- **Time**: 7:30–9:30 AM Pacific (peaks the front page right as US East wakes up)
- **Avoid**: Mondays (queue backlog), Fridays + weekends (low engagement)
- **Don't burn this twice**. One Show HN per project. If it flops, you don't get a second mainline shot.

## Pre-launch checklist (do BEFORE posting)

- [ ] README first viewport has a hero image / asciinema cast embedded
- [ ] One-line install verified on a clean machine (`curl -fsSL cue.dev/install | sh` or `npm install -g cue-ai`)
- [ ] `cue --help` output is clean, no debug noise, fits in a normal-width terminal
- [ ] At least 3 screenshots in the README (cue list, cue discover, cue launch)
- [ ] GitHub repo has all relevant topics set (run `scripts/update-repo-topics.sh`)
- [ ] Demo cast is current and matches the latest UI
- [ ] You have time blocked for the next 6 hours to reply to every comment within ~15 minutes — HN engagement decays fast

## Title

Pick ONE. Try them out loud — the strongest titles read as a complete thought.

- **Show HN: Cue – A package manager for Claude Code and Codex agent skills**
- **Show HN: Cue – Discover, install, and organize AI agent skills**
- **Show HN: Cue – Manage Claude Code profiles like Node manages projects**

The first variant tends to test best — concrete analogy (package manager) + specific products named (Claude Code, Codex).

## Body

```text
Hi HN,

I've been using Claude Code daily and kept running into the same friction: there's
no way to manage the dozens of skills, MCP servers, and plugins scattered across
GitHub. Each project needs a different subset, but Claude Code loads everything
globally — burning context tokens on irrelevant skills.

Cue is a thin layer between my shell and the real `claude` binary. It resolves
which profile applies to the current directory, materializes a per-profile
CLAUDE_CONFIG_DIR with just that profile's skills, MCPs, and plugins, and execs
the real agent. Same idea as Node version managers, but for AI coding agents.

Some specifics:

- Profiles are plain YAML files (~10 lines each); inheritance works
- 30+ built-in profiles covering rust, python-api, backend, cybersecurity,
  marketing, creative-media, etc.
- `cue discover` scans GitHub Code Search for `filename:SKILL.md` repos, scores
  them on signal quality (recency, SKILL.md presence, topics, fork-to-star ratio),
  and surfaces high-quality skills you wouldn't find otherwise
- Works with Claude Code, Codex, Cursor, Cline, Gemini CLI, Copilot, Windsurf,
  Roo Code, Amp, Aider — 10+ agents

The discovery side is the surprising part. We've already indexed ~360 skill repos
and the per-profile pages get cited by AI search (Perplexity, ChatGPT search,
Google AI Overviews) because they ship JSON-LD ItemList schema.

MIT license. Repo: https://github.com/opencue/cuecards

What I'd love feedback on:
1. Anyone else writing per-project agent configs by hand? What pain points
   am I missing?
2. The discover engine scores on SKILL.md presence + topics + recency — what
   other signals would you weight?
3. Is the "package manager for agents" framing the right one, or is it actually
   "version manager"?

Happy to answer anything in the thread.
```

**Length sanity check**: ~310 words. HN's sweet spot is 200–400. If you go longer, people scroll past.

## First-comment kit

Write these **before** posting so you can reply instantly. The first 30 minutes of comments set the trajectory.

### "How is this different from $X?"

```
Good question. The closest things I've seen:
- `mise` / `asdf` — version managers, not skill managers. Different problem.
- `claude-mem` — a memory MCP, not a profile manager. Complementary; cue can
  install it as a plugin.
- Hand-rolled .claude/ directories — what most people do today. Cue is the
  layer that makes those shareable + composable.

What cue specifically solves: per-cwd profile resolution + a curated discovery
engine. Neither exists in any other tool I'm aware of.
```

### "Why a CLI instead of a Claude Code plugin?"

```
Two reasons:
1. Cue's job is to materialize CLAUDE_CONFIG_DIR before claude starts. Plugins
   load INSIDE Claude Code, which is too late.
2. Cue also targets Codex CLI, Cursor, etc. — not just Claude Code. A plugin
   would lock us to one agent.
```

### "Is this overengineered for individual devs?"

```
For one project, yes — you could just symlink. The value compounds when:
- You work on 3+ projects with different stacks
- You collaborate with people who need the same skill setup
- You discover new skills regularly (cue discover does this nightly)

For solo devs on a single project, the bare `claude` is fine. Cue earns its
keep around project 2 or 3.
```

### "Does this work with $other_agent?"

```
Yes for: Claude Code (first-class), Codex (first-class), Cursor, Cline,
Gemini CLI, Copilot, Windsurf, Roo Code, Amp, Aider.

The materializer writes a generic ~/.claude/ directory (or the agent's
equivalent). Any agent that reads from the standard config locations picks
up the materialized profile.
```

### "How do you score / rank discovered repos?"

```
Per-factor breakdown (run `cue discover --verbose`):

+5    has SKILL.md
+3    has .claude/ directory
+2    uses @modelcontextprotocol/sdk
+2    per relevant topic, capped at 3
+0-3  recency, exponential decay with 60-day half-life
+0-2.5 popularity, log-scaled
+3    proven gem (≥50★ + skill desc)
+1-2  fork-to-star ratio
+1    description 40-200 chars (specific writing)
+1.5  mature AND actively maintained
-1    owner with numeric tail (bot/dump signal)
-3    no commits in 1yr

Source: src/commands/discover.ts L122
```

## Anti-patterns to avoid

- ❌ Don't begin with "I built this because…" — HN intros that lead with personal narrative read as self-indulgent.
- ❌ Don't link 5 things in the body. ONE GitHub URL. People click it.
- ❌ Don't reply defensively. If someone says "this is just $X", acknowledge the overlap, then say what's different.
- ❌ Don't downvote critics — every downvote you do shows up in your karma history and dang notices.
- ❌ Don't shadow-promote in the comments ("we have a Discord at…"). HN hates this.

## After the post

Within 24 hours:
- Update README with "**Featured on Hacker News**" badge linking to the thread
- Add a quote pulled from the top-voted comment to the README (with attribution)
- Save a screenshot of the front-page spot for `docs/launch-day-2026.png`

Within 7 days:
- Write a follow-up blog: "What I learned launching cue on HN" — turns the spike into evergreen content
- Reach out to top 5 commenters who asked feature questions; offer to pair on a PR
