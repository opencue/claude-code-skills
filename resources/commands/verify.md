---
description: Spawn an independent sub-agent to audit the current session's key claims, returning PASS/FAIL/PARTIAL + evidence. Adjudicate every FAIL/PARTIAL against source files before issuing corrections.
---

# /verify — external-verifier loop

Self-checking is fragile: the same reasoning that produced a claim also reviews it. `/verify` breaks that by handing the claims to a fresh sub-agent with no shared context, then adjudicating disagreements against the actual source files.

## Triage gate — run only when all three hold

1. **Decision-relevant** — the user will act on the result.
2. **Hard to reverse** — being wrong costs real recovery work (shipped bug, data loss, wrong architecture call).
3. **Mechanically checkable** — a fresh agent can confirm by reading files or running commands, not by re-deriving judgment.

If any condition fails, rely on inline `[VERIFIED]` with quoted evidence instead. In minimal-safe-mode, ask the user before spawning.

## How it runs

Spawn a sub-agent using cue's `Agent` tool with a `model` override (prefer a different model than the author, e.g. sonnet when the author is opus). Pass a self-contained, neutral audit prompt — the verifier gets no session history.

## Verifier-prompt template

Fill in `<REPO>`, `<CLAIMS>`, and `<FILES_TO_CHECK>` before spawning:

```
You are an independent code auditor. Do not edit anything.

Repo root: <REPO>

Audit each assertion below. For every item return exactly:
  PASS   — evidence (quote the line or command output)
  FAIL   — evidence (quote what you actually found)
  PARTIAL — evidence (quote both)

Several assertions may be false. Do not assume they are correct.

Assertions:
<CLAIMS>

Files / commands you are allowed to use:
<FILES_TO_CHECK>

Return a terse numbered list. One line of evidence per item. No prose.
```

Key rules for the prompt:
- Self-contained: state the repo path, exact file paths, and any commands to run.
- Neutral: "audit these assertions," not "confirm these are correct."
- Read-only: explicitly forbid edits.

## Adjudication checklist

For every FAIL or PARTIAL the verifier returns:

- [ ] Re-read the exact file at its absolute path (`/home/...`, not `./...`).
- [ ] Quote the relevant line directly, do not paraphrase.
- [ ] If the source confirms the verifier: issue a `[CORRECTION]` per the liedetector protocol.
- [ ] If the source contradicts the verifier: the source wins, the verifier finding was a hallucination. Do not issue a correction.
- [ ] Never trust a FAIL on its own; always check the file.

The verifier surfaces disagreements. The source settles them.

## Grep discipline (avoid false VERIFIED)

- Use `-H` (force filename in output), never `-h` (suppresses it). A match in fileB should not be credited to fileA.
- Use absolute paths. A drifted cwd makes grep read the wrong file silently.
- Quote the output line; a remembered line is `[INFERRED]`, not `[VERIFIED]`.

## When to skip

- Cosmetic or easily-reversed changes — inline `[VERIFIED]` is enough.
- Claims already backed by a quoted file excerpt in the same response.
- Minimal-safe-mode active and the user has not confirmed the sub-agent spawn.
