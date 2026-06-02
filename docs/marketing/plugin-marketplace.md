# Plugin marketplace submissions

## Claude Code plugin marketplace

### What it is

Claude Code supports an in-app plugin marketplace via `/plugin marketplace add <repo>`.
Listed plugins surface in `/plugin search` and `/plugin install`.

### Whether cue fits

Slightly meta — cue manages plugins, so listing cue itself in the marketplace
risks circular references (a user installing cue via the marketplace then using
cue to install other plugins). But the discovery value is real.

**Decision**: list cue as a marketplace entry but frame it as a **discovery
companion**, not a plugin replacement.

### Submission checklist

- [ ] Repo has `plugin.json` at root (Claude Code's plugin manifest)
- [ ] `plugin.json` declares: `name`, `version`, `description`, `commands`, `agents`
- [ ] All listed commands actually work when the plugin is installed
- [ ] README has a "Use as a Claude Code plugin" section pointing to `/plugin install`
- [ ] Published a versioned release (`git tag v0.x.y && git push --tags`)

### Plugin manifest skeleton

```json
{
  "name": "cue",
  "version": "0.1.0",
  "description": "Profile manager + skill discovery for Claude Code, Codex, and 10+ AI agents",
  "homepage": "https://github.com/opencue/cuecards",
  "author": "NagyVikt",
  "license": "MIT",
  "agents": ["claude-code", "codex"],
  "commands": [
    { "name": "cue-discover", "description": "Browse cached gems by profile" },
    { "name": "cue-init", "description": "Initialize a per-project cue profile" },
    { "name": "cue-list", "description": "List installed cue profiles" }
  ],
  "requires": {
    "node": ">=18"
  }
}
```

### Submission flow

```bash
# 1. Add plugin.json + commit
git add plugin.json
git commit -m "feat: claude-code plugin manifest"
git push

# 2. Tag a release
git tag v0.1.0
git push --tags

# 3. Tell users how to add it (in README)
echo "## Install as a Claude Code plugin" >> README.md
echo "" >> README.md
echo "    /plugin marketplace add opencue/cuecards" >> README.md
echo "    /plugin install cue" >> README.md
```

## Codex CLI plugin registry

OpenAI's Codex CLI has a similar plugin model. As of writing it's less mature
than Claude Code's, but worth listing once available. Same general checklist:
manifest, version, commands declared, README onboarding section.

## VS Code extension marketplace

Out of scope for cue's CLI nature, but a **lightweight VS Code extension** that
runs `cue` commands as palette actions would be a free distribution channel.
Sketch:

- Command: "cue: discover skills for this workspace"
- Command: "cue: switch profile"
- Command: "cue: install missing CLI tools"

Could ship as a thin wrapper around the cue binary. ~200 lines of TypeScript.
Punt until cue itself has 1000+ stars.

## Smithery

`scripts/publish-smithery.sh` already exists — Smithery is an MCP server registry.
Cue isn't an MCP server itself but the registry presence is still useful.

## npm trending

Passive. To trend in npm's `cli` keyword:
- Set `keywords` in package.json to include `cli`, `claude-code`, `codex`,
  `agent`, `mcp`, `profile-manager`
- Maintain regular weekly download volume (npm trends on absolute volume, not delta)

Add to `package.json`:

```json
{
  "keywords": [
    "claude-code", "claude", "codex", "ai-agent", "agent-skill",
    "mcp-server", "mcp", "profile-manager", "cli",
    "developer-tools", "anthropic", "openai"
  ]
}
```

## Tracking

| Marketplace | Submitted | Status | URL |
|---|---|---|---|
| Claude Code plugin marketplace | — | not submitted | — |
| Codex plugin registry | — | not available | — |
| Smithery | — | script exists | — |
| npm trending (`cli` keyword) | — | passive | https://www.npmjs.com/search?q=keywords:claude-code |
