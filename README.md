# cue — Agent Profile Manager for Claude Code & Codex

> Pick a profile. Launch with the right skills, MCPs, and plugins. Nothing else.

`cue` sits between your shell and the agent binary. Type `claude` or `codex` and `cue` intercepts: it resolves which profile applies in this directory, materializes an isolated `CLAUDE_CONFIG_DIR` (or `CODEX_HOME`) with just that profile's skills/MCPs/plugins, then exec's the real agent. Per-directory pins mean the right loadout follows your project, not your terminal session.

- `profiles/` — one directory per profile; the YAML decides what loads
- `resources/skills/` — local skill library composed into profiles
- `resources/mcps/` — MCP server configs composed into profiles
- `setup/` — per-OS install prompts you can paste into an agent session

License: [MIT](./LICENSE).

---

## Quick install — pick your OS

Two paths per OS:

- **Direct** — copy a shell block, paste in a terminal, runs the install end-to-end.
- **Agent-driven** — paste the corresponding `setup/<os>.md` into Claude Code as your first message; it walks you through the phases interactively (recommended if you've never set this up).

The shell blocks below trigger GitHub's "copy" button when you hover over them on github.com — one click to clipboard.

### macOS

Open **Terminal** (⌘+Space → "Terminal"), paste, run once:

```bash
# 1. Homebrew
[ -x "$(command -v brew)" ] || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# 2. Core tools
brew install bun node@22 python@3.12 uv jq rtk
# 3. Claude Code
curl -fsSL https://claude.ai/install.sh | sh
# 4. RTK token-savings hook
rtk init -g
echo "Setup complete. Run:  claude  — then paste setup/macos.md as your first message."
```

→ Full agent-driven prompt: **[setup/macos.md](./setup/macos.md)** (paste into Claude Code)

### Linux (Ubuntu / Debian / Fedora / Arch)

```bash
# 1. System packages
if   command -v apt    >/dev/null; then sudo apt update && sudo apt install -y curl git jq build-essential python3 python3-pip
elif command -v dnf    >/dev/null; then sudo dnf install -y curl git jq @development-tools python3 python3-pip
elif command -v pacman >/dev/null; then sudo pacman -S --noconfirm curl git jq base-devel python python-pip
fi
# 2. Bun
[ -x "$(command -v bun)" ] || curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
# 3. uv (Python venv manager)
[ -x "$(command -v uv)" ] || curl -LsSf https://astral.sh/uv/install.sh | sh
# 4. RTK
[ -x "$(command -v rtk)" ] || (curl -fsSL https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-unknown-linux-gnu.tar.gz | tar xz -C /tmp && sudo install /tmp/rtk /usr/local/bin/rtk)
# 5. Claude Code
curl -fsSL https://claude.ai/install.sh | sh
rtk init -g
echo "Setup complete. Run:  claude  — then paste setup/linux.md as your first message."
```

→ Full agent-driven prompt: **[setup/linux.md](./setup/linux.md)**

### Windows 10 / 11 (PowerShell)

Open **PowerShell**. First-time only:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then:

```powershell
# 1. Core tools via winget
winget install --id OpenJS.NodeJS.LTS  --silent --accept-source-agreements --accept-package-agreements
winget install --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements
winget install --id stedolan.jq        --silent --accept-source-agreements --accept-package-agreements
winget install --id Git.Git            --silent --accept-source-agreements --accept-package-agreements
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
# 2. Bun + uv
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { irm bun.sh/install.ps1 | iex }
if (-not (Get-Command uv  -ErrorAction SilentlyContinue)) { irm https://astral.sh/uv/install.ps1 | iex }
# 3. Claude Code via npm
npm install -g @anthropic-ai/claude-code
# 4. RTK
if (-not (Get-Command rtk -ErrorAction SilentlyContinue)) {
    Invoke-WebRequest -Uri "https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.zip" -OutFile "$env:TEMP\rtk.zip"
    Expand-Archive -Path "$env:TEMP\rtk.zip" -DestinationPath "$env:USERPROFILE\.local\bin" -Force
}
rtk init -g
Write-Host "Setup complete. Run:  claude  — then paste setup/windows.md as your first message."
```

→ Full agent-driven prompt: **[setup/windows.md](./setup/windows.md)**

(WSL2 user? Use the Linux block inside your WSL distro instead — cleaner.)

---

## Optional — Parallel agents tier (Colony + gitguardex)

If you want to run **2+ Codex/Claude agents in parallel on the same repo** without them stomping on each other, layer this tier on top of the lean stack:

- **[recodeee/gitguardex](https://github.com/recodeee/gitguardex)** — `gx` CLI. Per-agent branch + worktree isolation, file locks, PR-only merges.
- **[recodeee/colony](https://github.com/recodeee/colony)** — Local-first MCP for fleet coordination. Replaces 30k-token repo handoffs with ~400-token compact state in SQLite at `~/.colony`. Auto-detects file claims, task graphs, and prior decisions so agents see ownership before editing.

→ Full setup prompt: **[setup/parallel-agents.md](./setup/parallel-agents.md)** (Linux + macOS; Windows via WSL2)

Skip this tier if you only ever run one Claude Code window at a time — claude-mem + gbrain are enough for solo work.

---

## How it works

Typing `claude` or `codex` in a repo where cue's shims are installed triggers the launch flow:

1. **Resolve** — cue checks for a `.cue-profile` file in the current directory (or any parent up to `$HOME`). If none is found, it falls back to a repo-level default, a global default, or opens the TUI picker.
2. **Materialize** — cue builds `~/.config/cue/runtime/<profile>/{claude,codex}/` with a content-addressed hash check. If the profile hasn't changed, this is a no-op.
3. **Exec** — the real `claude` or `codex` binary is launched with `CLAUDE_CONFIG_DIR` (or `CODEX_HOME`) pointing at the materialized runtime tree.

The shims are a one-time install: `cue shell install`. See **[docs/launch.md](./docs/launch.md)** for the full resolve-precedence rules and bypass paths.

---

## Profiles

Profiles keep each Claude Code or Codex session lean by materializing only the skills and MCPs needed for the current job.

```bash
cue list
cue use medusa-dev
cd profiles/medusa-dev/workspace && claude
```

Start with the docs hub at **[docs/profiles/](./docs/profiles/)** for the schema, inheritance model, scan-to-profile flow, and troubleshooting.

---

## For AI agents

If you are an AI coding agent helping a human set this up, read **[AGENTS.md](./AGENTS.md)** first — it explains the bootstrap contract (phase-by-phase, ask-before-network, verify-each-step) and points to the per-OS prompt your user should paste.

---

## What you get

After bootstrap (~550 MB cold RAM per session):

| Layer | What it does |
|---|---|
| **claude-mem** plugin | Captures session observations passively; `mem-search "topic"` to recall across sessions |
| **caveman** plugin | `/caveman` for terse replies, `/caveman-commit` for Conventional Commit messages |
| **RTK** (CLI hook) | Filters shell-command outputs — 60-90% token savings on `ls` / `git` / `cat` |
| **gbrain** MCP | Personal knowledge wiki with embeddings, backlinks, timeline |
| **excel-mcp-server** | Native `.xlsx` read/write/format |
| **office-word-mcp-server** | Native `.docx` read/write |

claude-mem (passive) and gbrain (manual wiki) are complementary — both recommended.

---

## What's inside the repo

```
cue/
├── skills/         110+ Claude Code / Codex skills
│   ├── medusa/     building-with-medusa, storefront-best-practices, …
│   ├── codex-fleet/  bringup, dispatch, supervisors, panes, troubleshoot
│   ├── higgsfield/   generate, marketplace-cards, soul-id
│   ├── caveman/      caveman, caveman-commit, caveman-compress
│   └── ...
├── mcps/           MCP server snapshots + configs
│   ├── configs/    claude.sanitized.json, codex.sanitized.json, …
│   ├── mcps/       individual MCP server entries
│   └── plugins/    Claude Code plugin snapshots
└── setup/          paste-into-Claude-Code prompts (macos.md, linux.md, windows.md)
```

---

## Contributing

Each skill is a folder with `SKILL.md` (frontmatter + body) plus reference files. The frontmatter `description` is what the LLM matches against — write it as `"when user says X, do Y"`.

To add a new skill: copy an existing one as a template, edit `SKILL.md`, drop it under `skills/skills/<category>/<slug>/`. The catalog regenerates on the next sync.
