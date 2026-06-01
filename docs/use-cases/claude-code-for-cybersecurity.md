# Claude Code for cybersecurity — pen-testing, OSINT, malware analysis with cue

_Last updated: 2026-05-24_

**Short answer:** Run `cue use cybersecurity` in your security project to load **754 cybersecurity skills** (from [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills)) plus the [`agentshield`](https://github.com/affaan-m/agentshield) MCP server, the MITRE ATT&CK knowledge base MCP, scoped per-directory. cue installs every missing CLI (nmap, sqlmap, ffuf, suricata, yara, etc.) in one command via `cue cli install --all --yes`.

This is the official cue profile for offensive security, blue-team forensics, malware analysis, and OSINT work in Claude Code.

---

## What you get

| Layer | What ships |
|---|---|
| **754 skills** | Red-team recon, exploitation, post-exploitation, malware analysis, DFIR, incident response, threat intel, MITRE ATT&CK navigator, IR playbooks, secure-by-default architecture review |
| **MCP: agentshield** | Audits `.claude/`, `settings.json`, `mcp.json`, hooks, and agents for secrets, permission misconfigs, hook injection, MCP supply-chain risks, prompt-injection vectors |
| **MCP: mitre-attack** | 50+ tools for techniques, tactics, threat actors, malware, navigator layers |
| **CLIs auto-installed** | 74 system tools (nmap, sqlmap, hashcat, john, ffuf, gobuster, amass, subfinder, nuclei, yara, suricata, snort, zeek, scapy, frida, volatility, binwalk, foremost, radare2, apktool, jadx, dcfldd, kismet, aircrack-ng, wifite, testssl, oletools, peepdf, pdfid, androguard, floss, …) |
| **Persona** | (Add your own — recommended: "You're a senior penetration tester. You assume least privilege. You document every command. You never run anything destructive without explicit user confirmation.") |

---

## Quickstart

```bash
# 1. Install cue
npm install -g cue-ai

# 2. Pin the cybersecurity profile to your project
cd ~/security-engagements/acme-pentest
cue use cybersecurity

# 3. Install the system CLIs the skills declare (uses apt/snap/pipx automatically)
cue cli install --all cybersecurity --yes

# 4. Launch Claude Code with the full security loadout
claude
```

Inside the session, ask things like:

- *"Scan acme.example.com for open ports and fingerprint the services"* → triggers nmap-based skills
- *"Analyze this PCAP for command-and-control patterns"* → triggers zeek + suricata + scapy skills
- *"Reverse-engineer this Android APK and look for hardcoded secrets"* → triggers apktool + jadx + androguard
- *"Acquire a forensically sound disk image with hash verification"* → triggers dd + dcfldd skills
- *"Run a MITRE ATT&CK mapping for this incident"* → triggers the mitre-attack MCP

---

## Why cue (vs running Claude Code globally)

**Without cue:** Every Claude Code session loads every skill you've ever installed. The cybersecurity skills get drowned in marketing skills, frontend skills, docs skills — and the model picks the wrong tool. The everything-loadout (`full`) is ~81k always-on tokens — **~$24 / 100 msgs**.

**With cue and the cybersecurity profile:** Only the security skills + security MCPs load. Model picks the right tool first try. ~7k always-on tokens — **~$2.20 / 100 msgs** (`cue cost cybersecurity`).

That's a **~11× reduction** in always-on token cost on top of better tool selection.

---

## Find more security skills on GitHub

```bash
cue marketplace discover --cli-aware --limit 50
#   1 skill   352 ★  CTCT-CT2/openclaw-security-watchdog       → cybersecurity, backend
#                                                              ✓ no new installs (1 CLIs)
#   1 skill  1362 ★  elementalsouls/Claude-OSINT              → cybersecurity
#                                                              ⚠ 3/5 missing: amass, subfinder, nuclei
```

cue uses GitHub Code Search for `filename:SKILL.md` so you find real security skill repos, not awesome-lists. Each result is scored, mapped to the cybersecurity profile by keyword overlap, and annotated with which CLIs it needs.

---

## Safety: built-in guards

The `cybersecurity` profile inherits from `core`, which ships four universal safety hooks:

- **bash-quality-preflight** — blocks `rm -rf /`, fork bombs, raw `dd of=/dev/sd*`, `chmod 777 /` before Claude executes them
- **secrets-guard** — refuses Write/Edit on `.env`, `id_rsa`, `credentials.json`, `.pem`, `.key`, `~/.ssh/`, `~/.aws/`, `~/.gnupg/`
- **commit-message-guard** — rejects `git commit -m "wip"` / `"fix"` / `"update"`
- **session-summary** — logs every session end to `~/.config/cue/session-log.jsonl` for the failure-feedback loop

You can use destructive tools while still preventing the model from misusing them on your own system.

---

## See also

- [Glossary](../glossary.md) — formal definitions of Skill, MCP, Profile, etc.
- [cue vs alternatives](../comparison/) — head-to-head with skillport, claude-code-switcher, Kiro Powers
- [Profile schema](../../profiles/SCHEMA.md) — write your own custom cybersecurity profile
- [agentshield](https://github.com/affaan-m/agentshield) — the underlying security MCP this profile loads
