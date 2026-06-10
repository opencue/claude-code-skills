"""Single-shot reflective skill-body improver — the lightweight optimizer.

GEPA's iterative loop makes dozens of LLM calls and is slow on every backend.
This optimizer does the job in ONE `claude -p` call: read the current skill body
(plus any friction signals), propose an improved body, return it. The caller
then runs the same `cue lint-skill` gate + apply/proposal decision as GEPA.

Needs NO DSPy and NO API key — just `claude -p` (the user's Claude Code auth).
This is the path that actually delivers "skills improve as you use cue" cheaply.
"""

import re

from evolution.core.claude_lm import run_claude_p, claude_model_name


_PROMPT = """You are a cue skill-engineering specialist improving a Claude Code SKILL.md
**body** (the markdown after the YAML frontmatter). Rewrite it to be sharper and
more effective while keeping it lint-clean by cue conventions.

Rules (cue house style — how `cue lint-skill` and reviewers judge it):
- Concise and imperative. Lead each step with the verb or the answer.
- Keep clear trigger cues and a tight, numbered procedure. Every step that runs
  something shows the exact command in a code block, not "you could try…".
- Preserve the skill's intent and EVERY critical command, path, flag, and URL
  verbatim — dropping one is a regression that fails the gate.
- Do NOT include YAML frontmatter. Do NOT bloat it — stay within roughly 20% of
  the current length; shorter is better when nothing is lost.
- Voice: no em dashes; no AI filler (delve, crucial, robust, comprehensive,
  leverage, seamless, furthermore, moreover). Plain, direct sentences.

Skill description (for context, do not edit): {desc}
{signals_block}
Current body:
<CURRENT>
{body}
</CURRENT>

Return ONLY the improved body, wrapped exactly between these markers and nothing
else:
<SKILL_BODY>
...improved body here...
</SKILL_BODY>"""


def propose_improved_body(skill: dict, config, signals: str = "", timeout: int = 300) -> str:
    """One `claude -p` call → an improved skill body string.

    Falls back to the original body if the model returns nothing usable (so a
    bad response becomes a no-op "body unchanged", never a broken skill).
    """
    model = claude_model_name(config.optimizer_model)
    signals_block = f"\nObserved friction to address:\n{signals}\n" if signals.strip() else ""
    prompt = _PROMPT.format(desc=skill["description"], body=skill["body"], signals_block=signals_block)
    out = run_claude_p(prompt, model=model, timeout=timeout)
    return _extract_body(out, fallback=skill["body"])


_JUDGE_PROMPT = """You are a strict, INDEPENDENT reviewer of Claude Code SKILL.md bodies — you did
not write the revision and have no stake in it. Decide whether the REVISED body is
genuinely BETTER than the ORIGINAL for an agent deciding when and how to use this
skill — clearer triggers, tighter procedure, NO loss of critical detail (commands,
paths, constraints). Be conservative: if the revision drops useful content or is
merely different, it is NOT better.

Skill description (context): {desc}
{evidence_block}
ORIGINAL:
<A>
{original}
</A>

REVISED:
<B>
{revised}
</B>

Reply on a single line, exactly: VERDICT: BETTER|EQUAL|WORSE — <one-line reason>"""


def judge_is_better(skill: dict, evolved_body: str, config, timeout: int = 180,
                    evidence: str = ""):
    """Independent reviewer `claude -p` call: is the evolved body genuinely
    better? Returns (is_better: bool, reason: str). Conservative — anything but
    BETTER → False.

    Uses `config.reviewer_model` (a DIFFERENT, stronger model than the proposer's
    `optimizer_model`) so the rewrite isn't graded by its own author, and is fed
    deterministic `evidence` (lint/size/token-preservation results) to anchor the
    verdict in facts rather than vibes.
    """
    model = claude_model_name(config.reviewer_model)
    evidence_block = f"\nDeterministic gate results (already checked):\n{evidence}\n" if evidence.strip() else ""
    prompt = _JUDGE_PROMPT.format(
        desc=skill["description"], original=skill["body"], revised=evolved_body,
        evidence_block=evidence_block)
    out = run_claude_p(prompt, model=model, timeout=timeout)
    m = re.search(r"VERDICT:\s*(BETTER|EQUAL|WORSE)\s*[—\-:]*\s*(.*)", out, re.IGNORECASE)
    if not m:
        return False, f"unparseable judge verdict: {out.strip()[:120]}"
    verdict = m.group(1).upper()
    return verdict == "BETTER", f"{verdict}: {m.group(2).strip()[:160]}"


def _extract_body(text: str, fallback: str) -> str:
    """Pull the body from between the sentinels; tolerate stray fences.

    If the model did NOT emit the sentinels, treat the response as unusable and
    return the original body — so a refusal / error-prose becomes a safe no-op
    ("body unchanged" → proposal), never an applied garbage rewrite.
    """
    m = re.search(r"<SKILL_BODY>(.*?)</SKILL_BODY>", text, re.DOTALL)
    if not m:
        return fallback
    body = m.group(1).strip()
    # Strip a wrapping ```markdown / ``` fence if the model added one.
    body = re.sub(r"^```[a-zA-Z]*\n", "", body)
    body = re.sub(r"\n```$", "", body).strip()
    return body or fallback
