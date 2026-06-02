#!/usr/bin/env bash
# Stop hook — observability + opt-in nudge for the meta/next-steps closing.
#
# meta/next-steps asks the model to end a SUBSTANTIVE turn with a short, ranked
# "Next steps" block plus an offer to do the top item. That instruction lives in
# core's persona, which decays toward the end of long sessions — exactly when a
# good closing matters most. This hook does two independent things:
#
#   1. OBSERVABILITY (always on, never surfaces to the user): append one
#      next_steps event per turn to ~/.config/cue/analytics.jsonl recording
#      whether the turn looked substantive and whether it ended with a Next
#      steps block. Lets you MEASURE adoption offline instead of guessing.
#
#   2. NUDGE (opt-in, advisory, NEVER blocks): when the sentinel file exists,
#      print ONE stderr line if a substantive turn ended without a Next steps
#      block, so the model can self-correct. Off by default to avoid nagging.
#      Enable:  touch ${HOME}/.config/cue/next-steps-nudge
#      Disable: rm    ${HOME}/.config/cue/next-steps-nudge
#      Suppress one turn with [skip-next-steps] in the response.
#
# Honest about limits: "substantive" is a heuristic (the turn wrote files, or
# the final message is long). It cannot truly know the task was decision-
# relevant, so the nudge fires only on CLEARLY substantive, block-free turns.
# Every failure path FAILS OPEN — any error exits 0 silently. A closing nudge
# is never worth interrupting the user.
#
# No deps beyond python3. Exits 0 always.
set -euo pipefail

payload="$(cat -)"
log_dir="${HOME}/.config/cue"
log="${log_dir}/analytics.jsonl"
sentinel="${log_dir}/next-steps-nudge"
mkdir -p "$log_dir" 2>/dev/null || true

# transcript_path + session_id from the Stop payload (fail open on parse error).
read_field() {
  printf '%s' "$payload" | python3 -c "import sys,json
try:
    print(json.load(sys.stdin).get('$1','') or '')
except Exception:
    pass" 2>/dev/null || true
}
transcript_path="$(read_field transcript_path)"
session_id="$(read_field session_id)"
[[ -n "$transcript_path" && -r "$transcript_path" ]] || exit 0

# cue profile in this cwd (same resolution skill-fire-tracker uses).
profile=""
[[ -f .cue-profile ]] && profile="$(head -1 .cue-profile | tr -d '[:space:]')"
profile="${profile:-${CUE_PROFILE:-unknown}}"

# Compute metrics from the transcript. python3 emits one compact JSON object:
#   {"chars":N,"had_block":bool,"wrote_files":bool,"substantive":bool,"skip":bool}
metrics="$(python3 - "$transcript_path" <<'PY' 2>/dev/null || true
import sys, json, re

LONG_CHARS = 1200                                  # "substantive" proxy when no files written
WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
BLOCK_RE = re.compile(r"next steps?\b", re.IGNORECASE)

def is_prompt(rec):
    # A real user prompt (turn boundary) — NOT a tool_result, which also
    # arrives as type "user" but carries tool_result/non-text content.
    if rec.get("type") != "user":
        return False
    c = (rec.get("message") or {}).get("content")
    if isinstance(c, str):
        return bool(c.strip())
    if isinstance(c, list):
        return any(isinstance(b, dict) and b.get("type") == "text" for b in c)
    return False

last_text = ""
wrote_files = False          # scoped to the CURRENT turn (since the last real user prompt)
try:
    with open(sys.argv[1], encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if is_prompt(rec):
                wrote_files = False        # new user turn begins — reset the per-turn signal
                continue
            if rec.get("type") != "assistant":
                continue
            content = (rec.get("message") or {}).get("content")
            if isinstance(content, str):
                if content.strip():
                    last_text = content
                continue
            if not isinstance(content, list):
                continue
            parts = []
            for b in content:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text":
                    parts.append(b.get("text", ""))
                elif b.get("type") == "tool_use" and b.get("name") in WRITE_TOOLS:
                    wrote_files = True
            joined = "".join(parts)
            if joined.strip():
                last_text = joined
except Exception:
    sys.exit(0)

if not last_text:
    sys.exit(0)

chars = len(last_text)
print(json.dumps({
    "chars": chars,
    "had_block": bool(BLOCK_RE.search(last_text)),
    "wrote_files": wrote_files,
    "substantive": bool(wrote_files or chars > LONG_CHARS),
    "skip": "[skip-next-steps]" in last_text,
}))
PY
)"
[[ -n "$metrics" ]] || exit 0

field() {
  printf '%s' "$metrics" | python3 -c "import sys,json
try:
    print(json.load(sys.stdin).get('$1'))
except Exception:
    pass" 2>/dev/null || true
}
substantive="$(field substantive)"
had_block="$(field had_block)"
skip="$(field skip)"

ts="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# (1) Observability — always log one event. Never surfaces to the user.
printf '{"ts":"%s","event":"next_steps","profile":"%s","session_id":"%s","metrics":%s,"source":"hook"}\n' \
  "$ts" "$profile" "$session_id" "$metrics" >> "$log" 2>/dev/null || true

# (2) Nudge — opt-in, advisory, never blocks.
if [[ -f "$sentinel" && "$substantive" == "True" && "$had_block" != "True" && "$skip" != "True" ]]; then
  printf '\n⚠ next-steps: that looked like a substantive turn but it did not end with a Next steps block. Close with <=3 ranked, source-grounded follow-ups (continuation > loose-end > upside) and offer the top one. Suppress with [skip-next-steps].\n' >&2
fi

exit 0
