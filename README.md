<!--
  Structured data for AI search engines (ChatGPT, Perplexity, Google AI Overviews)
  and traditional crawlers. GitHub renders the README as raw HTML on github.com/<repo>
  and via GitHub Pages, so the JSON-LD blocks below are picked up by both Google's
  rich-results parser and LLM scrapers.
-->
<!--
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "cuecards",
  "alternateName": ["cue", "cue-ai"],
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Linux, macOS, Windows (WSL2)",
  "description": "cuecards is an open-source agent profile manager for Claude Code, OpenAI Codex, Cursor, Cline, Gemini CLI, GitHub Copilot, Windsurf, Roo Code, Sourcegraph Amp, and Aider. One cuecard per directory — skills, MCPs, plugins, persona, playbooks, gates. Cut per-message token cost 10–25×.",
  "url": "https://github.com/opencue/cuecards",
  "downloadUrl": "https://www.npmjs.com/package/cue-ai",
  "codeRepository": "https://github.com/opencue/cuecards",
  "license": "https://github.com/opencue/cuecards/blob/main/LICENSE",
  "programmingLanguage": "TypeScript",
  "runtimePlatform": "Bun",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
</script>
-->

<br>

<p align="center">
  <img src="./docs/assets/hero.svg" alt="cuecards — Agent Profile Manager for AI coding agents" width="820">
</p>

<br>

<h1 align="center">cuecards.</h1>

<p align="center">
  <strong>The agent profile manager for AI coding agents.</strong>
</p>

<p align="center">
  <sub>Your agent walks into a directory. The cuecard tells it who to be.</sub>
</p>

<br>

<p align="center">
  <a href="https://www.npmjs.com/package/cue-ai"><img src="https://img.shields.io/npm/v/cue-ai?style=flat-square&label=npm&color=1d1d1f&labelColor=f5f5f7" alt="npm"></a>&nbsp;
  <a href="https://www.npmjs.com/package/cue-ai"><img src="https://img.shields.io/npm/dw/cue-ai?style=flat-square&label=downloads&color=1d1d1f&labelColor=f5f5f7" alt="downloads"></a>&nbsp;
  <a href="https://github.com/opencue/cuecards/stargazers"><img src="https://img.shields.io/github/stars/opencue/cuecards?style=flat-square&label=stars&color=1d1d1f&labelColor=f5f5f7" alt="stars"></a>&nbsp;
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/opencue/cuecards?style=flat-square&label=license&color=1d1d1f&labelColor=f5f5f7" alt="MIT"></a>&nbsp;
  <img src="https://img.shields.io/badge/telemetry-none-1d1d1f?style=flat-square&labelColor=f5f5f7" alt="zero telemetry">
</p>

<br>

<p align="center">
  <code>npm install -g cue-ai</code>
</p>

<p align="center">
  <sub>Requires Node ≥20 and an existing <a href="https://github.com/anthropics/claude-code">Claude Code</a> or <a href="https://github.com/openai/codex">Codex</a> install — cue is a thin shim that exec's your agent, not a replacement.</sub>
  <br>
  <sub>package <code>cue-ai</code> &nbsp;·&nbsp; command <code>cue</code> &nbsp;·&nbsp; repo <a href="https://github.com/opencue/cuecards"><code>opencue/cuecards</code></a></sub>
</p>

<br>
<br>

---

## what is a cuecard.

A **cuecard** is everything your AI coding agent needs to be useful in one directory — the skills it loads, the MCP servers it connects to, the plugins it boots with, the persona it adopts, the playbooks it follows, the quality gates that block its "done" claim.

One cuecard per project. Your agent reads the right one the moment you launch.

| layer | what's on the cuecard |
|---|---|
| **skills** | only the ones this project actually needs |
| **MCPs** | scoped per directory, no global sprawl |
| **plugins** | the Claude Code plugins this project wants — no more |
| **persona** | how the agent thinks, writes, and self-edits |
| **playbooks** | the steps the agent follows for known tasks |
| **gates** | what must pass before the agent says "done" |

<br>

---

## quickstart.

```bash
npm install -g cue-ai                          # 1. install
cue shell install                              # 2. activate the claude shim (one-time; --codex adds codex)
cue discover search "code review"              # 3. find a skill
cue discover install review/code-review        # 4. add it
claude                                         # 5. launch — the cuecard is loaded
```

> Step 2 is what makes `claude` load your cuecard: it installs a `~/.local/bin/claude`
> shim that hands off to `cue launch`. Skip it and `claude` just runs vanilla Claude Code.

Search. Install. Use. No config files to edit. Works the same with `codex`, `cursor`, `cline`, `gemini`, and five other agents.

<p align="center">
  <img src="./docs/assets/demo.gif" alt="cuecards demo — discover, install, and launch a skill on a cuecard in 30 seconds" width="820" onerror="this.style.display='none'">
</p>

<p align="center">
  <img src="./docs/assets/interactive-tui.svg" alt="cuecards interactive TUI — browse profiles, skills, and skill detail side by side" width="820">
</p>

<br>

---

## works with.

<p align="center">
  <a href="https://github.com/anthropics/claude-code"><img src="https://img.shields.io/badge/Claude_Code-cc785c?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Code"></a>&nbsp;
  <a href="https://github.com/openai/codex"><img src="https://img.shields.io/badge/Codex-000000?style=flat-square&logo=openai&logoColor=white" alt="Codex"></a>&nbsp;
  <a href="https://cursor.sh"><img src="https://img.shields.io/badge/Cursor-000000?style=flat-square&logo=cursor&logoColor=white" alt="Cursor"></a>&nbsp;
  <a href="https://github.com/cline/cline"><img src="https://img.shields.io/badge/Cline-5A45FF?style=flat-square" alt="Cline"></a>&nbsp;
  <a href="https://github.com/google-gemini/gemini-cli"><img src="https://img.shields.io/badge/Gemini-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini"></a>&nbsp;
  <a href="https://github.com/features/copilot"><img src="https://img.shields.io/badge/Copilot-000000?style=flat-square&logo=github&logoColor=white" alt="Copilot"></a>&nbsp;
  <a href="https://windsurf.com"><img src="https://img.shields.io/badge/Windsurf-06B6D4?style=flat-square" alt="Windsurf"></a>&nbsp;
  <a href="https://github.com/RooVetGit/Roo-Code"><img src="https://img.shields.io/badge/Roo-7C3AED?style=flat-square" alt="Roo"></a>&nbsp;
  <a href="https://sourcegraph.com/amp"><img src="https://img.shields.io/badge/Amp-FF4500?style=flat-square&logo=sourcegraph&logoColor=white" alt="Amp"></a>&nbsp;
  <a href="https://aider.chat"><img src="https://img.shields.io/badge/Aider-14B8A6?style=flat-square" alt="Aider"></a>
</p>

<p align="center">
  <sub>One cuecard. Ten supported agents.</sub>
</p>

<br>

---

## by the numbers.

<p align="center">
  <strong>up to ~16×</strong>&nbsp;&nbsp;leaner always-on context
  <br><br>
  <strong>&lt; 5 ms</strong>&nbsp;&nbsp;warm launch overhead
  <br><br>
  <strong>69</strong>&nbsp;&nbsp;pre-built cuecards · <strong>330+</strong> local skills
  <br><br>
  <strong>10</strong>&nbsp;&nbsp;AI coding agents supported
  <br><br>
  <strong>MIT</strong>&nbsp;&nbsp;open source · zero telemetry · no daemon
</p>

<br>

---

## the money shot.

> Loading everything costs you tokens on every single message. cuecards cut your always-on context ~9–16× — and you can reproduce every number below with `cue cost --compare`.

| Loadout | Always-on context | Cost / 100 msgs (Sonnet input) |
|---|---|---|
| **Without cuecards** — `full` (every skill + MCP) | ~81k tokens | ~$24 😱 |
| **With cuecards** — `backend` profile | ~9k tokens | ~$2.70 ✅ |
| **With cuecards** — `caveman-quick` | ~6.8k tokens | ~$2.00 🚀 |

That's **~9× fewer always-on tokens** on a backend loadout (≈12× on `caveman-quick`, up to ≈16× on the leanest profiles) versus loading everything. Your model also picks the right tool faster because it's not scanning irrelevant descriptions on every message.

```bash
cue cost                      # token budget for your active profile
cue cost --compare            # full table: every profile ranked vs the `full` baseline
```

<br>

---

## why cuecards.

- **Cut always-on context up to ~16×.** Skills, MCPs, and plugins scoped per directory, not globally loaded into every session — reproduce it with `cue cost --compare`.
- **Five-dimensional agents.** Persona + playbooks + quality gates + evals + failure loop. Not just "more tools loaded" — composable expertise.
- **One cuecard, ten agents.** The same `profile.yaml` materializes into Claude Code, Codex, Cursor, Cline, Gemini, Copilot, Windsurf, Roo, Amp, and Aider native formats.

<details>
<summary><b>Other wins</b></summary>

<br>

- **Discover real skills, not awesome-lists.** `cue discover search` queries GitHub Code Search for `filename:SKILL.md`, scores results, maps each repo to a cuecard.
- **Install every CLI the cuecard needs in one command.** `cue cli install --all <cuecard>` auto-detects apt / brew / snap / pipx / npm per OS.
- **Block "done" claims with quality gates.** Stop-hook validators auto-run tests, lint, and build before the agent can declare a task complete.
- **Open safe, meaningful PRs on skill repos.** Built-in 90-day per-repo cooldown, 25-PRs/day cap, and `<!-- cue: ignore -->` opt-out marker.
- **Failure-feedback loop.** `cue failures --propose` reads recent session failures and asks Claude to draft profile improvements.

</details>

<br>

---

## reading cue's output — the colored tags.

cuecards-managed agents tag every research- or decision-relevant claim with a colored confidence marker so you can scan trust at a glance:

| Tier | Tag | Meaning |
|---|---|---|
| 🟢 Green | `[VERIFIED]` / `[KNOWN]` | Trust it (~90–99%) |
| 🟡 Yellow | `[INFERRED]` / `[ASSUMED]` | Verify if stakes matter (~50–85%) |
| 🟠 Orange | `[GUESSED]` / `[STALE]` | Verify before acting (~20–45%) |
| 🔴 Red | `[UNKNOWN]` | Don't trust; agent refused to fabricate |

Optional decile calibration on yellow/orange: `🟡 [INFERRED ~80%]`, `🟠 [GUESSED ~30%]`. The `~` signals it's a rough self-estimate, not a true probability.

Full system + when each tag fires: **[`resources/skills/skills/meta/integrity-tags/SKILL.md`](./resources/skills/skills/meta/integrity-tags/SKILL.md)** · Canonical protocol: **[`resources/personas/integrity-protocol.md`](./resources/personas/integrity-protocol.md)** (auto-injected into every profile via `persona_includes`).

<br>

---

## the catalog.

> One repo. 69 pre-built expert agents. Pin one with `cue use <name>` and `claude` launches with that cuecard's skills, MCPs, hooks, and commands materialized.

```bash
cue list                      # show everything
cue auto-detect               # suggest the right one for cwd
cue use medusa-dev            # pin to current directory
claude                        # launches with that cuecard's loadout
```

### Foundation

| Profile | What it's for |
|---|---|
| 🐢 **core** | Baseline shared by every cue profile — essentials only |
| 🦄 **full** | Diagnostic fallback that loads every local skill and MCP |

### Backend & Languages

| Profile | What it's for |
|---|---|
| 🐻 **backend** | APIs, webhooks, security review, CI, packaging, database, deploy |
| 🐹 **go-api** | Go API development — net/http, gin/echo/chi, GORM, testing |
| 🐍 **python** | FastAPI/Django/Flask APIs, SQLAlchemy/Alembic, pytest |
| 🦀 **rust** | All-in-one Rust — async, web, CLI/TUI, embedded, FFI, WASM, perf |

### Frontend

| Profile | What it's for |
|---|---|
| 🦋 **frontend** | Frontend UI implementation, redesign, screenshots, testing |
| ▲ **nextjs** | Next.js full-stack — App Router, Server Components, Vercel |
| ⚡ **vite** | Vite + React + TanStack ecosystem |
| 🎲 **threejs** | Three.js 3D — geometry, materials, shaders, animation |

### Security · Media · Growth · Verticals

| Profile | What it's for |
|---|---|
| 🔒 **cybersecurity** | 754 red/blue team skills + agentshield auditor |
| 🦉 **research** | Source-backed lookup, extraction, browser/market research |
| 🦚 **creative-media** | Image, video, product asset, brand workflows |
| 🎬 **video** | Frame extraction, audio transcription, visual understanding |
| 🐝 **docs-writer** | Documentation, Markdown, PDF, Obsidian, structured writing |
| 🦜 **marketing** | Copywriting, SEO, CRO, growth, channels, X/Twitter automation |
| 💼 **career** | Job hunting, resume, interview prep, salary negotiation |
| 🦊 **medusa-dev** | Medusa v2 backend, storefront, admin, migration |
| 🐺 **fleet-control** | Multi-agent orchestration, Colony coordination, gx safety |
| 🏢 **agency** | A full agency on tap — 63 delegatable subagents (design, sales, product, PM, finance, game dev, XR, paid media, QA) |

<sub>Full machine-readable list (all 69): **[`docs/data/profiles.md`](./docs/data/profiles.md)**. Don't see a fit? Run `cue auto-detect` or `cue ai "describe your stack"` to scaffold a new one.</sub>

<br>

---

## one cuecard, every agent.

The same `profile.yaml` materializes into each agent's native format — `.cursorrules`, `.clinerules`, `~/.gemini/skills/*.md`, `.github/copilot-instructions.md`, etc.

```bash
cue materialize cursor --profile backend     # → .cursorrules + .cursor/mcp.json
cue materialize --all --profile backend      # → all 10 agents at once
```

<details>
<summary><b>Full materialization matrix</b></summary>

| Agent | `cue materialize` command | Output |
|---|---|---|
| Claude Code | (default — shim) | `~/.config/cue/runtime/<profile>/claude/` |
| OpenAI Codex | (default — shim) | `~/.config/cue/runtime/<profile>/codex/` |
| Cursor | `cue materialize cursor` | `.cursorrules` · `.cursor/mcp.json` |
| Cline | `cue materialize cline` | `.clinerules` · `cline_mcp_settings.json` |
| Gemini CLI | `cue materialize gemini` | `~/.gemini/skills/*.md` |
| GitHub Copilot | `cue materialize copilot` | `.github/copilot-instructions.md` |
| Windsurf | `cue materialize windsurf` | `.windsurfrules` · `.windsurf/mcp.json` |
| Roo Code | `cue materialize roo` | `.roo/rules/*.md` · `.roo/mcp.json` |
| Sourcegraph Amp | `cue materialize amp` | `AGENTS.md` · `.amp/mcp.json` |
| Aider | `cue materialize aider` | `.aider.conventions.md` |

</details>

<br>

---

## daily commands.

```bash
# Pick a profile
cue use <profile>             # switch profile for this directory
cue list                      # see all available profiles

# Measure
cue cost                      # token budget for active profile
cue cost --compare            # every profile ranked vs the `full` baseline

# System dependencies
cue cli install --all --yes   # install every missing CLI

# Quality + discovery
cue lint-skill <path> [--fix]            # validate SKILL.md against R001-R008
cue marketplace discover --cli-aware     # find skill repos on GitHub
cue failures --propose [profile]         # Claude drafts profile improvements

# Audit
cue optimizer                 # dashboard: skills, MCPs, CLIs, usage per profile
cue doctor --fix              # diff declared vs actual state, auto-repair
```

`cue --help` shows the full ~50-subcommand surface. The set above covers everything you'll touch weekly.

<br>

---

## install.

```bash
npm install -g cue-ai
```

Then activate the shim once, and pin a profile in any project:

```bash
cue shell install             # one-time: installs the claude shim (--codex for codex)
cd ~/projects/q4-launch
echo marketing > .cue-profile
claude                        # launches with the marketing cuecard
```

<details>
<summary><b>Other install paths</b></summary>

| Path | Command |
|---|---|
| One-line script | `curl -fsSL https://raw.githubusercontent.com/opencue/cuecards/main/get.sh \| bash` |
| Manual clone | `git clone https://github.com/opencue/cuecards.git ~/Documents/cue && ~/Documents/cue/install.sh` |
| Per-OS bootstrap | paste [`setup/macos.md`](./setup/macos.md) · [`setup/linux.md`](./setup/linux.md) · [`setup/windows.md`](./setup/windows.md) into Claude Code |

</details>

`install.sh --help` lists `--yes`, `--codex`, `--uninstall`. Idempotent — safe to re-run.

<br>

---

## FAQ.

<details>
<summary><b>Does this break Claude Code's auto-update?</b></summary>

No. cue doesn't touch the `claude` binary — it intercepts the *call* via a one-line bash shim in `~/.local/bin/claude`, sets `CLAUDE_CONFIG_DIR`, and `exec`s the real binary. Claude Code's update mechanism still runs identically.
</details>

<details>
<summary><b>Is this a daemon?</b></summary>

No. Pure CLI. When you type `claude`, the shim runs `cue launch`, does a sha256 compare, materializes only if anything changed, then `exec`s. Nothing stays resident.
</details>

<details>
<summary><b>How fast is the overhead?</b></summary>

Cold start: 50–200 ms. Warm start: <5 ms (sha256 compare + `exec`). Imperceptible next to Claude Code's own startup.
</details>

<details>
<summary><b>Does cue send telemetry?</b></summary>

No. Everything cue computes (including the per-skill usage bars in `cue optimizer`) reads from your local `~/.claude/projects/**/*.jsonl` transcripts. Nothing leaves the machine.
</details>

<details>
<summary><b>What's the difference between cue and skillport / Kiro Powers?</b></summary>

| | cue | skillport / agent-skills-cli | Kiro Powers |
|---|---|---|---|
| Skills | ✅ | ✅ | ✅ |
| MCPs | ✅ | — | ✅ |
| Plugins | ✅ | — | — |
| Per-directory profiles | ✅ | — | ◐ (IDE-only) |
| Inheritance | ✅ | — | — |
| Persona / playbooks / gates / evals | ✅ | — | — |
| Multi-agent (Cursor/Cline/Copilot/etc.) | ✅ (10) | Claude only | IDE-only |
| CLI installer | ✅ | — | — |
| Failure-feedback loop | ✅ | — | — |
| Daemon required | None | None | IDE process |

cuecards is the only one that treats agent expertise as a composable system.
</details>

<details>
<summary><b>What does cue NOT do?</b></summary>

- It does not modify or repackage the Claude Code / Codex binary.
- It does not host a remote skill marketplace — skills live in your repo or come from open-source sources.
- It does not coordinate multi-agent runs (that's [`recodeee/colony`](https://github.com/recodeee/colony) + [`gitguardex`](https://github.com/recodeee/gitguardex), layered via the parallel-agents tier).

</details>

<br>

---

## deep dives.

The bits that didn't fit on the landing page:

| Topic | Read |
|---|---|
| Launch flow (resolve → materialize → exec) | [`docs/launch.md`](./docs/launch.md) |
| Profile catalog (all 69, machine-readable) | [`docs/data/profiles.md`](./docs/data/profiles.md) |
| Bootstrap contract for AI agents installing cue | [`AGENTS.md`](./AGENTS.md) |
| Parallel agents tier (Colony + gitguardex) | [`setup/parallel-agents.md`](./setup/parallel-agents.md) |
| Confidence-tag system (`[VERIFIED]`, `[INFERRED]`, `[GUESSED]`, etc.) | [`resources/skills/skills/meta/integrity-tags/SKILL.md`](./resources/skills/skills/meta/integrity-tags/SKILL.md) |

<sub>Topics like the 5-dimensional expert agent model, system CLI installer mechanics, marketplace discovery, SKILL.md linter rules, and the `cue optimizer` dashboard are tracked in git history at the old README until they get their own pages — `git log --diff-filter=D -- README.md` finds them.</sub>

<br>

---

## who uses cue.

| Project | Profile | What they do |
|---|---|---|
| [opencue/cuecards](https://github.com/opencue/cuecards) | `full`, `skill-writer` | Dogfooding cue on itself |
| [recodeee/colony](https://github.com/recodeee/colony) | `fleet-control` | Multi-agent coordination MCP |
| [recodeee/gitguardex](https://github.com/recodeee/gitguardex) | `backend` | Branch + worktree isolation for parallel agents |

> **Using cue?** Open a PR or drop a link in [Discussions](https://github.com/opencue/cuecards/discussions).

<br>

---

## star history.

<a href="https://star-history.com/#opencue/cuecards&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=opencue/cuecards&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=opencue/cuecards&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=opencue/cuecards&type=Date" width="720" />
  </picture>
</a>

<br>

---

## contributing.

```bash
git clone https://github.com/opencue/cuecards.git
cd cue && bun install
bun test                                      # tests (lib + commands)
bun run src/index.ts --help                   # run locally
```

| Want to | Run |
|---|---|
| Add a skill | `cue skills-new <name>` then edit `resources/skills/skills/<category>/<name>/SKILL.md` |
| Add a profile | `cue new <name>` then `cue validate <name>` |
| Share your profile | `cue share publish --profile <name>` |
| Report a bug | [Open an issue](https://github.com/opencue/cuecards/issues) |

License: [MIT](./LICENSE).
