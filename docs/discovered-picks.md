# Discovered Skills — Curated Picks

> Filtered from `docs/discovered.md` (nightly auto-scan, 196 repos across 10 profiles)
> through the lens of *this* user's setup: Medusa shops on Coolify+Hostinger,
> Colony/`gx` parallel-agents tier, gbrain MCP, RTK/caveman token discipline,
> codegraph indexing, recodee, gitguardex.
>
> Last curated: 2026-05-26. Re-run after each `git pull` of `docs/discovered.md`.

Legend: `[ ]` unevaluated · `[~]` tried · `[x]` installed · `[skip]` rejected after closer look

---

## Cluster 1 — Multi-agent / fleet (parallel-agents tier)

You already run Colony + `gx` worktrees + codex-fleet. These are direct comparables.

| | Score | Repo | Why it fits |
|---|---|---|---|
| [ ] | 16.9 | [first-fluke/oh-my-agent](https://github.com/first-fluke/oh-my-agent) | Portable vendor-agnostic harness; sibling pattern to Colony |
| [ ] | 16   | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | Teams-first multi-agent orchestration |
| [ ] | 16   | [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) | Ghostty-based terminal with vertical tabs for parallel agents |
| [ ] | 14.5 | [stablyai/orca](https://github.com/stablyai/orca) | "Fleet of parallel agents" IDE — adjacent to codex-fleet |
| [ ] | 11.5 | [tt-a1i/hive](https://github.com/tt-a1i/hive) | Browser-native hive-mind; compare vs Colony hivemind |

---

## Cluster 2 — MCP routing & context savings (RTK / caveman lane)

You run ~20 MCPs and ship the three-lane memory protocol. Anything that fronts/compresses MCPs is high-value.

| | Score | Repo | Why it fits |
|---|---|---|---|
| [ ] | 16.9 | [yvgude/lean-ctx](https://github.com/yvgude/lean-ctx) | "Lean Cortex" cognitive context layer, 51+ MCPs |
| [ ] | 14.7 | [juyterman1000/entroly](https://github.com/juyterman1000/entroly) | Context compression + hallucination detection — pair with caveman/RTK |
| [ ] | 14.6 | [wanaku-ai/wanaku](https://github.com/wanaku-ai/wanaku) | MCP router |
| [ ] | 13.8 | [smart-mcp-proxy/mcpproxy-go](https://github.com/smart-mcp-proxy/mcpproxy-go) | MCP proxy in Go |
| [ ] | 14   | [maximhq/bifrost](https://github.com/maximhq/bifrost) | "50x faster than LiteLLM" enterprise AI gateway |

---

## Cluster 3 — Code intelligence (you use codegraph)

| | Score | Repo | Why it fits |
|---|---|---|---|
| [ ] | 14   | [abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus) | Zero-server code intelligence engine; codegraph alternative |
| [ ] | 13   | [ozgurcd/gograph](https://github.com/ozgurcd/gograph) | Local CLI repo-structure generator |
| [x] | 11.3 | [fallow-rs/fallow-skills](https://github.com/fallow-rs/fallow-skills) | JS/TS codebase intelligence — already loaded as `fallow` skill |

---

## Cluster 4 — Review, pre-commit, dual-path verdicts

You ship a lot; multi-model review and gap-auditing pay back fast.

| | Score | Repo | Why it fits |
|---|---|---|---|
| [x] | 14.3 | [Zandereins/hydra](https://github.com/Zandereins/hydra) | Multi-perspective review council — already loaded as `hydra` skill |
| [ ] | 14   | [Randallyi/blind-spot-scanner](https://github.com/Randallyi/blind-spot-scanner) | Knowledge-gap auditor: "don't know what you don't know" |
| [ ] | 11.4 | [butevecom-commits/Deliberation-Loop](https://github.com/butevecom-commits/Deliberation-Loop) | 6-role structured debate for reasoning |

---

## Cluster 5 — Workflow / orchestration engines

Adjacent to recodee + Medusa job runs.

| | Score | Repo | Why it fits |
|---|---|---|---|
| [ ] | 17   | [archestra-ai/archestra](https://github.com/archestra-ai/archestra) | Enterprise AI platform with MCP registry + gateway |
| [ ] | 16   | [dagucloud/dagu](https://github.com/dagucloud/dagu) | Lightweight workflow engine + Web UI |
| [ ] | 15   | [n8n-io/n8n](https://github.com/n8n-io/n8n) | Fair-code workflow automation (you already know n8n) |

---

## Cluster 6 — Infra-adjacent (Coolify / Hostinger / VPS)

Not direct hits — Hostinger MCP is your own — but pattern-reusable.

| | Score | Repo | Why it fits |
|---|---|---|---|
| [ ] | —    | [jurislm/hetzner-mcp](https://github.com/jurislm/hetzner-mcp) | Hetzner sibling pattern → reusable shape for Hostinger MCP |
| [ ] | —    | [nikil11/stacks-clarity-mcp](https://github.com/nikil11/stacks-clarity-mcp) | Compose-stack clarity — matches one-stack-per-shop |

---

## 🚫 Filtered out (high score but low fit)

These auto-grouped into `core` because of star counts but don't match your stack:

- BOSS 直聘 CLI · 倪海厦中医 · 造价大师 · Korean privacy/legal templates · Bible-study toolkit
- Dating-coach skills · Mockplus design importer · ESP32 server · K-pop booking · 韩国 retail
- Most macOS-only desktop apps (you're on Linux): osaurus, cherry-studio (electron — maybe), XcodeBuildMCP
- Auth/billing helpers for products you don't run (helix payments, voidly-pay)

---

## How to act on this list

Install one pick into the matching cue profile:

```bash
cue skills add <owner>/<repo> --profile <profile>
```

After a nightly `git pull` updates `docs/discovered.md`, re-run the lens and refresh this file —
diff `docs/discovered.md` against the previous version to surface only what's *new* worth a look.
