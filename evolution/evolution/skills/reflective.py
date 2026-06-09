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


_PROMPT = """You are improving a Claude Code SKILL.md **body** (the markdown after the YAML
frontmatter). Rewrite it to be sharper and more effective while keeping it
lint-clean by cue conventions: concise, imperative, with clear trigger cues and
a tight procedure. Do NOT include YAML frontmatter. Do NOT bloat it — stay within
roughly 20% of the current length. Preserve the skill's intent and any critical
commands/paths verbatim.

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
