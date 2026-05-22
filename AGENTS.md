# AGENTS — cue bootstrap contract

If you are an AI coding agent (Claude Code, Codex, etc.) helping a human install
cue on their machine, this file is your instruction sheet. Read it before
touching the shell.

---

## What cue is

**cue — Agent Profile Manager for Claude Code & Codex.**

A thin layer between the user's shell and the real `claude` / `codex` binary.
The user types `claude`, `cue` resolves which profile applies to their cwd,
materializes a per-profile `CLAUDE_CONFIG_DIR` (or `CODEX_HOME`) with just that
profile's skills, MCPs, and plugins, then exec's the real agent. Profiles live
under `profiles/`; the runtime is built on-demand under `~/.config/cue/runtime/`.

The repo also ships a library of pre-built resources:
- `resources/skills/` — 110+ installable skills (slash-commands + runnable docs)
- `resources/mcps/` — MCP server configs (gbrain, excel-mcp, word-mcp, plus snapshots)
- `setup/` — per-OS phased install prompts

See [docs/launch.md](./docs/launch.md) for the resolve → materialize → exec flow.

The user can choose **direct shell install** (one block, runs end-to-end) or **agent-driven phased install** (you walk them through it, verifying each step). This document covers the agent-driven path.

---

## Bootstrap contract — non-negotiable

1. **Detect the OS first.** Don't assume — Linux/macOS look similar at the surface but `brew` vs `apt`, `/opt/homebrew` vs `/usr/local`, and shell vs PowerShell flow differently. Use `uname -s` (macOS = Darwin, Linux = Linux) and `$OS` / `$env:OS` on Windows.

2. **Pick the right setup file** and load it:
   - macOS → `setup/macos.md`
   - Linux → `setup/linux.md`
   - Windows → `setup/windows.md`
   - WSL2 → tell user to use `setup/linux.md` inside the WSL distro
   - **Parallel-agents add-on** (Colony + gitguardex) → `setup/parallel-agents.md`. Only after the lean stack is verified. Linux/macOS/WSL2 only — native Windows PowerShell can't run `gx`.

3. **Ask the §9 questions before any shell work:**
   - macOS: Apple Silicon (`/opt/homebrew`) or Intel (`/usr/local`)?
   - Linux: which package manager (apt / dnf / pacman / other)?
   - Windows: native PowerShell or WSL2?
   - All: claude-mem + gbrain, or one only?
   - All: RTK telemetry — leave disabled (default) or opt in?

4. **Run one phase at a time.** The setup files split the install into Phase 1–8. After each phase, run the verification command at the bottom of that phase and show the output to the user before moving on. If verification fails, stop and diagnose — don't barrel into the next phase.

5. **Ask before destructive or hard-to-reverse steps:**
   - Adding to `~/.bashrc` / `~/.zshrc` / PowerShell profile
   - Editing existing `~/.claude.json` or `~/.claude/settings.json` (we merge, don't clobber, but confirm the merge plan)
   - Installing global npm/bun packages
   - Running anything with `sudo`

6. **Network access requires confirmation.** Mention each external download before running it (Homebrew, Bun, Claude Code, RTK, gbrain, uvx packages). User can deny a specific one and you skip that capability.

7. **Idempotency.** Every phase must be safely re-runnable. Use `[ -x "$(command -v X)" ] || install-X` style guards. Never assume the user is starting from zero.

8. **Don't auto-enable plugins until the user confirms.** Phase 6 of each setup file shows the `enabledPlugins` JSON — display it, get an explicit OK before writing.

9. **Token discipline.** Once the install lands, push the user to start their next Claude Code session with `/caveman` enabled. RTK + caveman together are the bulk of the cost savings — pair them.

---

## Failure modes — common gotchas

| Symptom | Likely cause | Action |
|---|---|---|
| `uvx: command not found` after `uv` install | Shell PATH didn't update | Source the shell profile or have user open a fresh terminal |
| `bun: command not found` from gbrain wrapper | Wrapper used `which bun` at install time but Claude Code env has different PATH | Edit wrapper to use absolute path (`/opt/homebrew/bin/bun`, `$HOME/.bun/bin/bun`, etc.) |
| Plugin install hangs at marketplace fetch | Network glitch | Cancel, re-run `/plugin marketplace add <name>` |
| gbrain process orphans to PID 1 | Wrapper's parent-watcher not running | Check wrapper has the `kill -0 "$parent_pid"` loop |
| `npm install -g` permission denied on Linux | Global npm needs sudo or a prefix change | Prefer `bun install -g` or fix the npm prefix |
| `winget` not found on older Windows 10 | App Installer outdated | Install from Microsoft Store: "App Installer" |

---

## After bootstrap — what to tell the user

When the user finishes Phase 8 and `claude --version` works:

1. **Restart Claude Code** so the plugin marketplaces + MCP servers register cleanly.
2. **Test gbrain**: in the new Claude Code session, ask "save a page titled 'install-success' with today's date". The agent should call `mcp__gbrain__put_page`. If the tool is missing, the wrapper path in `~/.claude.json` is wrong.
3. **Test Excel/Word**: ask "create a blank spreadsheet at /tmp/test.xlsx". The agent should call `mcp__excel__create_workbook` (or similar). First call may take 30 s while `uvx` downloads the package.
4. **Test claude-mem**: end the session and start a new one in the same directory. Run `/mem-search` for a topic from the prior session — it should surface observations.
5. **Verify RTK is active**: have the user run `rtk gain` after a few minutes of normal use — should show non-zero savings.

If any of those fail, walk back to the relevant phase in the setup file and diagnose. The §8 troubleshooting table in each per-OS file covers the common cases.

---

## Optional follow-ups

After the baseline lean stack is working, the user may want:
- **Parallel-agents tier** — Colony MCP + gitguardex (`gx`). For running 2+ Codex/Claude windows on the same repo without stomp. Walk them through `setup/parallel-agents.md` only after they confirm they actually want concurrent agents. Linux/macOS/WSL2.
- The claude-mem `--smol` patch (§7 in each setup file) — only if running 4+ concurrent sessions
- More skills from `resources/skills/skills/` — they all live in this repo and get picked up automatically once the symlinks are installed (`resources/skills/scripts/install-claude.sh` and `install-codex.sh`)
- The auto-sync workflow (`resources/skills/scripts/sync-all.sh` + systemd timer or launchd agent) so updates land without manual `git pull`

Point them at the relevant `resources/skills/scripts/` files when they ask, not before — keep the bootstrap minimal.

---

## Parallel-agents tier — extra contract clauses

If the user opts into `setup/parallel-agents.md`, add these clauses to your operating contract:

1. **Never edit on the primary checkout.** Always `gx branch start` first, then `cd` into the printed worktree path. The primary tree stays clean.
2. **Claim before editing.** Call `mcp__colony__task_claim_file` (or `gx locks claim --branch <br> <files...>`) for every file you're about to touch. Two agents touching the same file is the entire failure mode this tier exists to prevent.
3. **Read Colony state before assuming.** On every resume / follow-up: `mcp__colony__hivemind_context` → `mcp__colony__attention_inbox` → `mcp__colony__task_ready_for_agent`. Don't search by `task_list` as your default — that's an inventory tool.
4. **Finish through `gx`, not raw git.** `gx branch finish --branch <br> --via-pr --wait-for-merge --cleanup` is the only sanctioned exit. It owns commit, push, PR open, merge wait, and worktree prune.
5. **Don't simplify shared infrastructure.** If you're about to delete or rewrite something on a path that other agents touch (Colony helpers, gx wrappers, sync scripts), stop and post a Colony handoff first.
6. **OMX fallback only when Colony is unreachable.** `.omx/notepad.md` is the legacy path — don't write to it unless `mcp__colony__*` calls fail.

---

## Maintainer note

The contributor docs (how to add a skill / MCP) live in `README.md § Contributing`. This file is scoped to the bootstrap contract above — what an agent doing installs needs to know.
