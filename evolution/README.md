# cue skill-content evolution

GEPA-optimize the **body** of a cue `SKILL.md` from real session usage, gated by
`cue lint-skill`. Ported and adapted from
[NousResearch/hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution).

## How it relates to `cue evolve`

These operate at two different altitudes and are **complementary**:

| | `cue evolve` (TS, existing) | this package (Python, new) |
|---|---|---|
| Altitude | **profile composition** — which skills are in `profile.yaml` | **skill content** — the SKILL.md body text |
| Action | add/remove skills | rewrite the body via DSPy + GEPA |
| Gate | manual `--apply` | `cue lint-skill` (auto-apply if it passes) |
| Log | `~/.config/cue/evolution-log.jsonl` | same log (`kind: "skill-content"`) |

## The loop (mirrors the hermes diagram)

```
find cue skill → build eval dataset (synthetic | sessiondb | golden)
        ↓
   GEPA optimizer  ← keyword-overlap metric (see caveat)
        ↓
   candidate body → constraint gates: size, growth, structure, `cue lint-skill`
        ↓
   holdout beats baseline AND lint passes?
     ├ yes → write SKILL.md + backup (.bak-<ts>) + evolution-log entry
     └ no  → write inert proposal under evolution/proposals/, log, don't mutate
```

## Quick start

```bash
# offline — validates the cue wiring with NO install and NO LLM key:
python3 -m venv .venv && ./.venv/bin/pip install -e .
./.venv/bin/python -m evolution.skills.evolve_skill \
    --skill eu-funding/ted-tender-search --dry-run

# real optimization — needs the optimize extra + an LLM key:
./.venv/bin/pip install -e '.[optimize]'
export ANTHROPIC_API_KEY=...          # default models are anthropic/claude-*
./.venv/bin/python -m evolution.skills.evolve_skill \
    --skill eu-funding/ted-tender-search --iterations 10

# evolve from your real Claude Code history (~/.claude/history.jsonl):
./.venv/bin/python -m evolution.skills.evolve_skill \
    --skill eu-funding/ted-tender-search --eval-source sessiondb
```

## Configuration (env)

| Var | Default | Purpose |
|---|---|---|
| `CUE_REPO` | auto-discovered | path to the cue checkout |
| `CUE_LINT_CMD` | `cue lint-skill {path} --json` | the auto-apply gate command |
| `CUE_EVOLVE_OPTIMIZER_MODEL` | `anthropic/claude-sonnet-4-5` | GEPA reflection model |
| `CUE_EVOLVE_EVAL_MODEL` | `anthropic/claude-haiku-4-5` | eval / judge / dataset model |

The provider is inferred from the model-string prefix by DSPy/LiteLLM
(`anthropic/…`, `openai/…`, `openrouter/…`). Nothing is hardcoded to OpenAI —
cue is a Claude shop, so Claude is the default.

## Honest caveats (read before trusting a holdout delta)

- **The GEPA metric is a keyword-overlap heuristic, not the LLM judge.** Carried
  over verbatim from upstream: `skill_fitness_metric` scores word-set overlap
  between the rubric and the output. The richer `LLMJudge` exists but is not
  wired into the loop. Overlap is a *weak* proxy for "the skill is genuinely
  better." Treat holdout deltas as directional and lean on the `cue lint-skill`
  gate + human review of proposals. (Slice 2b: wire `LLMJudge` into the metric.)
- **It optimizes a proxy task**, not Claude Code itself: the skill body is run as
  instructions to the eval model on synthetic/mined tasks. Transfer to real
  Claude Code behaviour is plausible but unvalidated.
- **A real run costs tokens** and needs an LLM key. The `--dry-run` path costs
  nothing and is the offline wiring check.
- **Frontmatter is immutable.** Only the body is evolved; `name`/`description`/
  `tags` are preserved so a skill's identity and registry id never drift.
