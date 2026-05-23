---
description: Rematerialize the active cue profile and restart claude with updated config
---

Steps:
1. Run `cue launch --rematerialize` via Bash. This force-rebuilds the runtime directory for the current profile (ignoring the hash cache), picking up any skill/MCP/CLAUDE.md changes.
2. Report what the command outputs (it prints what changed: skills added/removed, MCPs changed, etc.).
3. Then run `exec ~/.local/bin/claude` via Bash to restart with the fresh config.

If `~/.local/bin/claude` does not exist, print: "shim not installed; run `cue shell install` in a terminal first."

Note: MCP server connection changes require the full restart. Skill and CLAUDE.md changes take effect immediately after rematerialization without restart, but restarting ensures a clean state.
