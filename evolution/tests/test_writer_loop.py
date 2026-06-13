"""Seam tests for the single-shot writer->lint->critic loop (reflective.py).

DSPy-free: every model call is `run_claude_p`, which we monkeypatch. We route a
faked response by prompt content (writer prompts carry the <CURRENT> body block;
critic prompts ask for a VERDICT line). validate_fn is a test double that fails
lint for any body containing the marker "LINTFAIL".
"""

from types import SimpleNamespace

import pytest

from evolution.skills import reflective


def _cfg():
    # claude_model_name only needs the model strings; run_claude_p is patched.
    return SimpleNamespace(optimizer_model="claude-code/sonnet",
                           reviewer_model="claude-code/opus")


def _skill(body="OLD BODY"):
    return {"description": "a test skill", "body": body}


class FakeClaude:
    """Scripted run_claude_p. `writer` and `critic` are lists of responses popped
    per call; records every prompt for assertions."""

    def __init__(self, writer, critic):
        self.writer = list(writer)
        self.critic = list(critic)
        self.writer_prompts = []
        self.critic_prompts = []

    def __call__(self, prompt, model="sonnet", timeout=300):
        if "<CURRENT>" in prompt:  # writer
            self.writer_prompts.append(prompt)
            return self.writer.pop(0)
        # critic
        self.critic_prompts.append(prompt)
        return self.critic.pop(0)


def _validate(body):
    ok = "LINTFAIL" not in body
    return {
        "ok": ok,
        "results": [SimpleNamespace(passed=ok, constraint_name="lint",
                                    message="ok" if ok else "R001: body too long")],
        "evidence": f"lint: {'pass' if ok else 'FAIL'}",
        "lint_errors": "" if ok else "lint: R001: body too long",
    }


def _wrap(body):
    return f"<SKILL_BODY>{body}</SKILL_BODY>"


def test_happy_path_one_round_better(monkeypatch):
    fake = FakeClaude(writer=[_wrap("NEW GOOD BODY")],
                      critic=["VERDICT: BETTER — clearer triggers"])
    monkeypatch.setattr(reflective, "run_claude_p", fake)
    out = reflective.writer_critic_loop(_skill(), _cfg(), validate_fn=_validate, max_rounds=2)
    assert out["body"] == "NEW GOOD BODY"
    assert out["candidate_ok"] is True
    assert out["quality_ok"] is True
    assert out["rounds"] == 1
    assert out["judge_reason"].startswith("BETTER")
    assert len(fake.writer_prompts) == 1 and len(fake.critic_prompts) == 1


def test_lint_fail_then_retry_passes(monkeypatch):
    fake = FakeClaude(writer=[_wrap("LINTFAIL body"), _wrap("clean body v2")],
                      critic=["VERDICT: BETTER — good"])
    monkeypatch.setattr(reflective, "run_claude_p", fake)
    out = reflective.writer_critic_loop(_skill(), _cfg(), validate_fn=_validate, max_rounds=2)
    assert out["body"] == "clean body v2"
    assert out["candidate_ok"] is True
    assert out["quality_ok"] is True
    assert out["rounds"] == 2
    # the 2nd writer call must have been told about the lint failure
    assert "R001" in fake.writer_prompts[1] or "FAILED the cue gate" in fake.writer_prompts[1]


def test_critic_worse_feeds_fixes_back(monkeypatch):
    fake = FakeClaude(
        writer=[_wrap("v1 clean"), _wrap("v2 clean")],
        critic=["VERDICT: WORSE — dropped a flag\nFIXES: restore the --json flag",
                "VERDICT: EQUAL — no real gain\nFIXES: tighten the trigger"])
    monkeypatch.setattr(reflective, "run_claude_p", fake)
    out = reflective.writer_critic_loop(_skill(), _cfg(), validate_fn=_validate, max_rounds=2)
    assert out["body"] == "v2 clean"          # last lint-clean candidate kept
    assert out["candidate_ok"] is True
    assert out["quality_ok"] is False          # never reached BETTER
    assert out["rounds"] == 2
    assert out["judge_reason"].startswith("EQUAL")
    # round-2 writer prompt carries the critic's fixes from round 1
    assert "restore the --json flag" in fake.writer_prompts[1]


def test_lintfail_round_never_clobbers_clean_best(monkeypatch):
    # round1 clean but WORSE; round2 lint-fails → best must remain round1's clean body
    fake = FakeClaude(writer=[_wrap("clean v1"), _wrap("LINTFAIL v2")],
                      critic=["VERDICT: WORSE — meh\nFIXES: do better"])
    monkeypatch.setattr(reflective, "run_claude_p", fake)
    out = reflective.writer_critic_loop(_skill(), _cfg(), validate_fn=_validate, max_rounds=2)
    assert out["body"] == "clean v1"
    assert out["candidate_ok"] is True


def test_critic_outage_keeps_proposal(monkeypatch):
    def boom_or_write(prompt, model="sonnet", timeout=300):
        if "<CURRENT>" in prompt:
            return _wrap("clean candidate")
        raise RuntimeError("claude CLI not on PATH")
    monkeypatch.setattr(reflective, "run_claude_p", boom_or_write)
    out = reflective.writer_critic_loop(_skill(), _cfg(), validate_fn=_validate, max_rounds=2)
    assert out["body"] == "clean candidate"
    assert out["candidate_ok"] is True
    assert out["quality_ok"] is False
    assert "critic unavailable" in out["judge_reason"]


def test_writer_outage_falls_back_to_original(monkeypatch):
    def boom(prompt, model="sonnet", timeout=300):
        raise RuntimeError("claude -p timed out")
    monkeypatch.setattr(reflective, "run_claude_p", boom)
    out = reflective.writer_critic_loop(_skill("ORIGINAL"), _cfg(), validate_fn=_validate, max_rounds=2)
    assert out["body"] == "ORIGINAL"
    assert out["quality_ok"] is False


def test_critic_step_returns_fixes(monkeypatch):
    monkeypatch.setattr(reflective, "run_claude_p",
                        lambda *a, **k: "VERDICT: WORSE — dropped detail\nFIXES: restore the path; keep the flag")
    is_better, reason, fixes = reflective.critic_step(_skill(), "new body", _cfg())
    assert is_better is False
    assert reason.startswith("WORSE")
    assert "restore the path" in fixes


def test_back_compat_wrappers(monkeypatch):
    # judge_is_better → 2-tuple; propose_improved_body → extracted body
    monkeypatch.setattr(reflective, "run_claude_p",
                        lambda prompt, **k: ("VERDICT: BETTER — ok" if "<CURRENT>" not in prompt
                                             else _wrap("WRAPPED BODY")))
    is_better, reason = reflective.judge_is_better(_skill(), "x", _cfg())
    assert is_better is True and reason == "BETTER: ok"
    assert reflective.propose_improved_body(_skill(), _cfg()) == "WRAPPED BODY"
