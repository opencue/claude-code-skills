# OSS agent-skill / MCP candidates — discovery shortlist

> Generated Phase 0 of the "mine most-starred OSS → improve profiles" plan.
> Source: direct `gh search repos --sort=stars` sweeps + `cue discover`. The
> `cue discover` gem-scorer caps at ~1.6k★ (tuned for *hidden* gems), so the
> star-sorted sweep below is the authoritative "most-starred" list.
> **Status: awaiting your go/no-go before anything is wired.**

## Trust tiers (Phase-0 supply-chain vet)

- 🟢 **Official** — maintained by Anthropic / Vercel / Microsoft / GitHub / Google / Upstash. Low supply-chain risk.
- 🟡 **Reputable community** — well-known author, high stars. Read `allowed-tools` per skill before wiring (deferred to the Phase-2 pre-wire gate).
- 🟠 **Niche / vet-hard** — security tooling or low-profile author; deep read required before wiring.
- 📚 **List/framework** — not wired directly; a *source* to cherry-pick from or port techniques.

Already referenced (skip / expand): `vercel-labs/agent-skills`→vercel, `anthropics/skills`→studio, `github/github-mcp-server`→backend, `upstash/context7`→core.

---

## A. Skills — wire via `skills.npx` (adopt)

| Repo | Stars | Trust | What it adds | Best-fit profile(s) | Impact |
|---|---|---|---|---|---|
| `addyosmani/agent-skills` | 48k | 🟡 | Production-grade engineering skills for coding agents | frontend, nextjs, backend | reach +30% 🟡 |
| `kepano/obsidian-skills` | 34k | 🟡 | Markdown/Obsidian agent skills | research, docs-writer | reach +20% 🟡 |
| `mvanhorn/last30days-skill` | 27k | 🟡 | Research a topic across Reddit/news/last-30-days | research | reach +20% 🟡 |
| `Jeffallan/claude-skills` | 9.6k | 🟡 | 66 full-stack dev skills (cherry-pick) | frontend, backend | reach +15% 🟡 |
| `SawyerHood/dev-browser` | 6.2k | 🟡 | Give the agent a real browser | browser | reach +20% 🟡 |
| `elementalsouls/Claude-OSINT` | 1.6k | 🟠 | 90+ recon modules, 2 paired skills | cybersecurity, secops | reach +25% 🟠 |
| `digitalocean-labs/do-app-platform-skills` | 29 | 🟢 | DigitalOcean App Platform deploy skills | ops, deployment | niche +10% 🟡 |
| `creatify-ai/video-ad-generator` | 32 | 🟡 | Generate video ads | video, creative-media | niche +10% 🟠 |

## B. MCP servers — wire via `claude.sanitized.json` + profile `mcps:[]` (adopt)

| Repo | Stars | Trust | What it adds | Best-fit profile(s) | Impact |
|---|---|---|---|---|---|
| `microsoft/playwright-mcp` | 33k | 🟢 | Real-browser automation MCP | browser, frontend, qa, designer | reach +35% 🟢 |
| `googleapis/mcp-toolbox` | 15k | 🟢 | DB-access MCP (Postgres/MySQL/…) | backend, postgres, supabase | reach +25% 🟡 |
| `GLips/Figma-Context-MCP` | 15k | 🟡 | Figma layout → agent context | designer, frontend | reach +25% 🟡 |
| `hangwin/mcp-chrome` | 11k | 🟡 | Chrome-extension MCP (alt to playwright) | browser | overlap +10% 🟠 |
| `K-Dense-AI/claude-skills-mcp` | 391 | 🟡 | MCP that searches/serves Claude skills | studio, skill-writer (meta) | meta +20% 🟡 |

## C. Lists & frameworks to MINE / port techniques (not wired directly) 📚

| Repo | Stars | Use |
|---|---|---|
| `obra/superpowers` | 217k | Skills framework + SD methodology — port technique patterns into our meta skills |
| `anthropics/skills` | 146k | Official skills — expand beyond studio; cherry-pick into core/relevant profiles |
| `punkpeye/awesome-mcp-servers` | 88k | Canonical MCP index — source for B picks |
| `modelcontextprotocol/servers` | 86k | Official reference MCP servers — source for B |
| `ComposioHQ/awesome-claude-skills` | 63k | Curated skill index — source for A |
| `sickn33/antigravity-awesome-skills` | 39k | 1,500+ agentic skills — source for A |
| `github/awesome-copilot` | 34k | Instructions/agents/skills — port prompt patterns |
| `asgard-ai-platform/skills` | 208 | 301 skills across 22 domains — source for A |

---

## Recommended first wave (broad sweep, gap-driven targeting in Phase 1)

**Adopt (8):** playwright-mcp, mcp-toolbox, Figma-Context-MCP (MCPs); addyosmani/agent-skills, kepano/obsidian-skills, mvanhorn/last30days-skill, SawyerHood/dev-browser, Claude-OSINT (skills).

**Port (3):** obra/superpowers → meta skills; github/awesome-copilot → prompt patterns; anthropics/skills → expand coverage.

**Mine as source (4 lists):** awesome-mcp-servers, ComposioHQ/awesome-claude-skills, antigravity-awesome-skills, modelcontextprotocol/servers.

## Vet gate still owed before wiring (Phase 2, per repo)
Read each adopted skill's `allowed-tools` + body / each MCP's `command`+`args`:
- 🟠 `elementalsouls/Claude-OSINT` — security/recon tooling; confirm no auto-exfil, scope `Bash(*)`.
- 🟡 community skills — confirm tool scope is justified, pin `repo` to a tag/sha to stop drift.
- MCPs — confirm npx package name + that secrets are `${ENV}` placeholders only.
