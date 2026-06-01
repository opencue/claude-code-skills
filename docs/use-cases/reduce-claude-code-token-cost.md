# How to reduce Claude Code token cost — the cue playbook

_Last updated: 2026-06-01_

**Short answer:** Loading every skill globally (the `full` everything-loadout) costs **~81k always-on tokens — ~$24 / 100 messages** at Sonnet input pricing. cue's per-directory profile isolation cuts that to **~9k tokens (~$2.70 / 100 msgs)** on a `backend` profile — **~9× less** (up to ~16× on the leanest profiles). RTK and caveman terse-mode then trim *output* tokens on top, on a separate axis. Every number here is reproducible with `cue cost --compare`, and the model also picks the right tool faster because it isn't scanning irrelevant descriptions on every message.

This page is the data-backed playbook for cutting Claude Code costs.

---

## Where the tokens actually go

Run `cue eval --breakdown <profile>` to see your real breakdown:

```text
  Profile Eval: ecc

  Loadout
    Skills: 8  Rules: 10  Commands: 6  Hooks: 4  MCPs: 1  Plugins: 1
    Per-message: 779 tokens  ($0.0023/msg)
    On-demand:   20.0K tokens (lazy — only when invoked)

  Breakdown (per-message tokens)
    skills       449  76%  ████████████████████  (+8.3K on-demand)
    rules         18   2%  █                      (+4.4K on-demand)
    commands      18   2%  █                      (+5.6K on-demand)
    hooks        120  15%  ████                   (+392 on-demand)
```

**Two budgets, not one:**

- **Per-message** = what every single turn pays in input tokens. This is the budget that compounds across a session.
- **On-demand** = lazy bodies. Skills, commands, and rule bodies are *referenced* in CLAUDE.md as one-line entries but their full content is only loaded when the model actually reads them. They count once per session, not per turn.

Naïve token estimation conflates these and over-reports cost by 20×+. `cue eval` shows the real picture.

---

## The 3 optimizations that actually compound

### 1. Profile isolation (biggest single win — up to ~16×)

Without cue: `~/.claude/` is one global folder. Every session loads every skill, every MCP, every plugin you've ever installed. Frontend session loads cybersecurity skills. Marketing session loads Rust skills.

With cue: `cue use backend` in your backend repo. `cue use marketing` in your marketing repo. Each session loads only the relevant profile's loadout.

Run `cue cost --compare` to see the delta in your own setup.

### 2. RTK shell-output filter (60–90% per shell command)

[RTK](https://github.com/rtk-ai/rtk) is a Claude Code hook that filters shell command output before it hits the model. `ls -la /usr` produces ~10K tokens of file listings; RTK distills it to a 200-token summary the model can act on. cue ships RTK in every profile via `core`.

Run `rtk gain` to see your cumulative savings.

### 3. Caveman terse-output mode (~40% output tokens)

The `caveman` plugin ships a `/caveman` slash command that flips Claude into a terse-response mode — no filler, no "I'd be happy to help", no "let me explain..." prefixes. You also save on output tokens (which are billed at the higher rate for Sonnet/Opus).

Activate per-session with `/caveman` or globally by triggering it at session start.

---

## Real numbers (always-on context, Claude Sonnet 4.6 input pricing)

> Reproduce these with `cue cost --compare`. "Always-on" = skill descriptions + MCP tool schemas + CLAUDE.md loaded into *every* message; lazy skill bodies load on demand and aren't counted here. Input is $3/MTok.

| Setup | Always-on tokens | Cost / 100 msgs |
|---|---|---|
| **Naïve global Claude Code** — the `full` everything-loadout | ~81,000 | **~$24** |
| **cue with `backend` profile** | ~9,000 | **~$2.70** |
| **cue with `caveman-quick`** | ~6,800 | **~$2.00** |

That's **~9× less always-on context** on `backend` (≈12× on `caveman-quick`, up to ≈16× on the leanest profiles). On a separate axis, **RTK** trims shell *output* tokens and **caveman** trims model *output* — both cut per-turn output cost further on top of the always-on savings above.

---

## How to actually measure your savings

```bash
# 1. Establish a baseline — full vs your profile
cue cost --compare                      # every profile ranked vs the `full` baseline
cue cost backend                        # always-on + lazy breakdown for one profile

# 2. Track over time
cue stats                               # session count + duration per profile
rtk gain                                # cumulative RTK savings in tokens

# 3. Drill into a specific profile
cue eval backend --breakdown            # see where the tokens are going
cue failures backend --days 7           # see where the profile is failing (= where it's wasteful)
```

---

## What NOT to do

- **Don't over-prune profiles.** Cutting skills makes the model worse at the things you actually do. The savings come from removing *irrelevant* skills, not from minimalism for its own sake.
- **Don't disable hooks to save tokens.** The safety hooks (bash-preflight, secrets-guard, commit-message-guard) cost ~120 tokens/message total. They prevent real failures that cost orders of magnitude more.
- **Don't stack token-saving prompts.** `caveman` mode is enough; adding "be terse" + "no filler" + "short answer" in custom prompts is double-counting and confuses the model.

---

## See also

- [Glossary: per-message vs on-demand](../glossary.md#materialization) — formal definitions
- [Claude Code for marketing teams](./claude-code-for-marketing-teams.md) — domain-specific savings
- [cue's optimizer dashboard](../../README.md#cue-optimizer--see-every-loadout-at-a-glance) — see your loadout at a glance
- [RTK upstream](https://github.com/rtk-ai/rtk) — the shell-output filter cue bundles
