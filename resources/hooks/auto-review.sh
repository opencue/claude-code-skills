#!/usr/bin/env bash
# Stop hook — independent reviewer-agent loop (the enforced arm of
# "review before finishing"). OFF by default.
#
# When the MAIN agent finishes a code-producing turn, this hook spawns a fresh,
# INDEPENDENT reviewer agent (headless `claude -p`, Sonnet) that runs the
# code-review-deep pass over the working-tree diff. If the reviewer reports
# CRITICAL/HIGH findings, the hook returns {"decision":"block","reason":<feedback>}
# so the main agent CANNOT stop — it must address the feedback, VERIFY the fix,
# and only then finish. A clean review (or nothing to review) lets it stop.
#
# The soft arm of this behaviour is the `core` persona rule (always on); this
# hook is the hard backstop and is opt-in, mirroring careful-mode / next-steps.
#
# Opt-in: active only when ${HOME}/.config/cue/auto-review-enabled exists.
#   Enable:  touch ${HOME}/.config/cue/auto-review-enabled
#   Disable: rm    ${HOME}/.config/cue/auto-review-enabled
# Suppress one turn with [skip-auto-review] anywhere in the response.
#
# Loop safety (belt + suspenders):
#   - recursion guard: CUE_AUTO_REVIEW_INNER=1 makes the reviewer's own session
#     a no-op, so the reviewer can't re-trigger this hook recursively.
#   - diff-hash state: we record the diff we last reviewed. If the agent stops
#     again WITHOUT changing the diff, it can't make progress → let it go.
#   - round cap (MAX_ROUNDS): hard ceiling on consecutive blocks per cwd.
#
# Reviewer command is overridable for tests: set CUE_AUTO_REVIEW_CMD to a shell
# command that reads the diff on stdin and prints the verdict. Default spawns
# `claude -p --model sonnet`.
#
# Fail-open: any error (no git, no claude, timeout, malformed input) → exit 0.

set -uo pipefail

MAX_ROUNDS=2
DIFF_BUDGET=60000   # cap chars sent to the reviewer

# ─── Recursion guard ───────────────────────────────────────────────────────
[ "${CUE_AUTO_REVIEW_INNER:-}" = "1" ] && exit 0

# ─── Opt-in gate ───────────────────────────────────────────────────────────
state_file="${HOME}/.config/cue/auto-review-enabled"
[ -f "$state_file" ] || exit 0

payload="$(cat -)"
extract() {
  printf '%s' "$payload" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"//; s/\"$//"
}
transcript_path="$(extract transcript_path)"
cwd="$(extract cwd)"
[ -z "$cwd" ] && cwd="$PWD"

# ─── Need a git repo with changes to review ────────────────────────────────
command -v git >/dev/null 2>&1 || exit 0
git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Tracked changes vs HEAD (covers staged + unstaged). Fall back to index diff
# when the repo has no commits yet.
diff="$(git -C "$cwd" diff HEAD 2>/dev/null || git -C "$cwd" diff 2>/dev/null)"

# New, untracked files are the common "agent wrote a fresh module" case — fold
# their contents in so the reviewer sees them too.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  diff="${diff}
=== new file: ${f} ===
$(head -n 400 "$cwd/$f" 2>/dev/null)"
done < <(git -C "$cwd" ls-files --others --exclude-standard 2>/dev/null)

# Nothing of substance → let the turn stop.
[ -z "$(printf '%s' "$diff" | tr -d '[:space:]')" ] && exit 0
diff="$(printf '%s' "$diff" | head -c "$DIFF_BUDGET")"

# ─── Opt-out marker (scan the tail of this turn's transcript) ──────────────
if [ -n "$transcript_path" ] && [ -r "$transcript_path" ]; then
  if tail -c 20000 "$transcript_path" 2>/dev/null | grep -qF "[skip-auto-review]"; then
    exit 0
  fi
fi

# ─── Loop state: per-cwd diff hash + round count ───────────────────────────
hash_of() {
  if command -v sha1sum >/dev/null 2>&1; then printf '%s' "$1" | sha1sum | awk '{print $1}'
  else printf '%s' "$1" | shasum 2>/dev/null | awk '{print $1}'; fi
}
cwd_key="$(hash_of "$cwd")"
diff_hash="$(hash_of "$diff")"
sdir="${HOME}/.config/cue/auto-review"
mkdir -p "$sdir" 2>/dev/null || exit 0
sfile="$sdir/${cwd_key}.state"
last_hash=""; rounds=0
if [ -r "$sfile" ]; then
  last_hash="$(sed -n '1p' "$sfile" 2>/dev/null)"
  rounds="$(sed -n '2p' "$sfile" 2>/dev/null)"; rounds="${rounds:-0}"
fi

# Same diff we already reviewed → the agent didn't change anything → let it go.
if [ "$diff_hash" = "$last_hash" ]; then
  printf '%s\n0\n' "$diff_hash" > "$sfile"
  exit 0
fi
# Round ceiling hit → stop nagging, let it finish.
if [ "$rounds" -ge "$MAX_ROUNDS" ]; then
  printf '%s\n0\n' "$diff_hash" > "$sfile"
  exit 0
fi

# ─── Run the independent reviewer ──────────────────────────────────────────
review_prompt="You are an INDEPENDENT code reviewer running the code-review-deep pass.
Review ONLY the diff below. Report blocking issues only:
  CRITICAL: security holes, data loss, crashes, injection, broken auth.
  HIGH:     real bugs, broken contracts, race conditions, wrong logic.
Output one terse bullet per finding, each prefixed with 'CRITICAL:' or 'HIGH:'.
If there are no CRITICAL or HIGH issues, output exactly: REVIEW_CLEAN
Do not restate the diff. Do not praise. Do not list LOW/style nits. Max 12 bullets.

--- DIFF ---
${diff}
--- END DIFF ---"

if [ -n "${CUE_AUTO_REVIEW_CMD:-}" ]; then
  verdict="$(printf '%s' "$diff" | timeout 180 bash -c "$CUE_AUTO_REVIEW_CMD" 2>/dev/null)"
else
  command -v claude >/dev/null 2>&1 || exit 0
  verdict="$(CUE_AUTO_REVIEW_INNER=1 timeout 240 claude -p --model sonnet "$review_prompt" 2>/dev/null)"
fi
[ -z "$verdict" ] && exit 0   # reviewer failed → fail-open, allow stop

# Clean → record this diff and allow stop.
if printf '%s' "$verdict" | grep -qF "REVIEW_CLEAN"; then
  printf '%s\n0\n' "$diff_hash" > "$sfile"
  exit 0
fi
# No real findings parsed → don't block on noise.
if ! printf '%s' "$verdict" | grep -qE 'CRITICAL:|HIGH:'; then
  printf '%s\n0\n' "$diff_hash" > "$sfile"
  exit 0
fi

# ─── Block: feed the reviewer's findings back to the main agent ────────────
rounds=$((rounds + 1))
printf '%s\n%s\n' "$diff_hash" "$rounds" > "$sfile"
findings="$(printf '%s' "$verdict" | grep -E 'CRITICAL:|HIGH:' | head -12)"
reason="An independent reviewer agent (code-review-deep on Sonnet, round ${rounds}/${MAX_ROUNDS}) flagged issues in your diff:

${findings}

Address every CRITICAL and HIGH item above, then VERIFY the fix by running the test/build/check that proves it, and say what you changed. Finish only once these are resolved. If a finding is a false positive, state why. Suppress the reviewer for one turn with [skip-auto-review]."

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
else
  esc="$(printf '%s' "$reason" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null)"
  [ -z "$esc" ] && exit 0
  printf '{"decision":"block","reason":%s}\n' "$esc"
fi
exit 0
