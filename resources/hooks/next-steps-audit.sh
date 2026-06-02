#!/usr/bin/env bash
# Stop hook — warn (never block) when a SUBSTANTIVE turn ends without a
# Next steps block. Companion to the meta/next-steps skill: that skill is an
# auto-fire output-format behaviour ("close substantive work with a ranked
# Next steps block + offer the top one"), and like all discretion behaviours
# the model under-fires it when it is deep in a long task. This hook re-grounds
# the behaviour in observable output, the same way tag-audit.sh re-grounds the
# liedetector tags.
#
# It is deliberately conservative — a nagging hook gets disabled, which is
# worse than silence. It only warns when ALL of:
#   - opt-in gate file exists (off by default),
#   - the turn did real work (>=1 file mutation OR >=3 Bash steps),
#   - the response is long enough to be a substantive closing (>=600 chars),
#   - no Next steps / offer marker is present,
#   - the user did not ask for output-only and is not merely accepting a step.
#
# Opt-in only: active when ${HOME}/.config/cue/next-steps-check exists.
# Enable:  touch ${HOME}/.config/cue/next-steps-check
# Disable: rm    ${HOME}/.config/cue/next-steps-check
# Suppress one turn with [skip-next-steps] anywhere in the response.
#
# No external deps beyond jq. Exits 0 always (fail-open).

set -uo pipefail

# ─── Opt-in gate ───────────────────────────────────────────────────────────
state_file="${HOME}/.config/cue/next-steps-check"
[ -f "$state_file" ] || exit 0

payload="$(cat -)"
extract() {
  printf '%s' "$payload" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"//; s/\"$//"
}

transcript_path="$(extract transcript_path)"
session_id="$(extract session_id)"
[ -z "$transcript_path" ] || [ ! -r "$transcript_path" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

CACHE_DIR="${XDG_RUNTIME_DIR:-/tmp}/cue-next-steps-audit"
mkdir -p "$CACHE_DIR" 2>/dev/null || exit 0

# Throttle: once per Stop event per session.
throttle="$CACHE_DIR/throttle.${session_id:-default}"
now=$(date +%s)
last=$(stat -c '%Y' "$throttle" 2>/dev/null || echo 0)
[ $((now - last)) -lt 5 ] && exit 0
touch "$throttle"

# ─── Slice this turn (everything since the last user message) ──────────────
last_user_line=$(awk 'BEGIN{n=0; last=0} {n++} /"type":"user"/{last=n} END{print last}' "$transcript_path")
[ "$last_user_line" = "0" ] && exit 0
turn_jsonl="$CACHE_DIR/turn.jsonl"
tail -n +"$last_user_line" "$transcript_path" > "$turn_jsonl"

# ─── Assistant text + tool_use names this turn ─────────────────────────────
assistant_text=$(jq -r '
  select(.type == "assistant") |
  .message.content |
  if type == "array" then .[] else . end |
  select(.type == "text") |
  .text
' "$turn_jsonl" 2>/dev/null)

tool_names=$(jq -r '
  select(.type == "assistant") |
  .message.content |
  if type == "array" then .[] else . end |
  select(.type == "tool_use") |
  .name
' "$turn_jsonl" 2>/dev/null)

# The user message that opened this turn (text parts only). Used for the
# output-only and "accepting a prior step" skip conditions.
user_text=$(head -1 "$turn_jsonl" | jq -r '
  select(.type == "user") |
  .message.content |
  if type == "array" then (.[] | select(.type == "text") | .text) else . end
' 2>/dev/null)

# ─── Opt-out ───────────────────────────────────────────────────────────────
if grep -qF "[skip-next-steps]" <<< "$assistant_text"; then exit 0; fi

# ─── Skip: user asked for output only ──────────────────────────────────────
if grep -qiE "output only|no commentary|just the (raw|json|code|file|output|diff)|no suggestions|no follow.?ups" <<< "$user_text"; then
  exit 0
fi

# ─── Skip: user is merely accepting a previously offered step ──────────────
# Short acceptances ("yes", "do #1", "go", "ok do it") mean "execute", not
# "open a fresh block this turn" — see the skill's When-to-skip rule.
user_trimmed=$(printf '%s' "$user_text" | tr -d '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
if [ "${#user_trimmed}" -lt 28 ] && \
   grep -qiE "^(y|yes|yep|yeah|sure|ok|okay|go|do it|do #?[0-9]|proceed|continue|approved|ship it)\b" <<< "$user_trimmed"; then
  exit 0
fi

# ─── Substantive-work signal ───────────────────────────────────────────────
mutation_count=0
bash_count=0
while IFS= read -r name; do
  [ -z "$name" ] && continue
  case "$name" in
    Edit|Write|MultiEdit|NotebookEdit) mutation_count=$((mutation_count + 1)) ;;
    Bash) bash_count=$((bash_count + 1)) ;;
  esac
done <<< "$tool_names"

# Not substantive → a missing block is correct. (Factual lookups, mid-convo
# answers, trivial one-liners all land here.)
substantive=0
if [ "$mutation_count" -ge 1 ] || [ "$bash_count" -ge 3 ]; then substantive=1; fi
[ "$substantive" -eq 0 ] && exit 0

# ─── Length gate ───────────────────────────────────────────────────────────
# Terse turns (incl. caveman/brief, where the block collapses to one line) are
# exempt — requiring a full block there would be noise.
text_len=${#assistant_text}
[ "$text_len" -lt 600 ] && exit 0

# ─── Block-present detection ───────────────────────────────────────────────
# Any of: the "Next steps" heading, the caveman "Next:" one-liner, or the
# "Want me to … / Want it" offer that every block form ends on.
if grep -qiE "next step|^[[:space:]]*next:|want me to|want it\b|shall i|should i (go|proceed|do)" <<< "$assistant_text"; then
  exit 0
fi

# ─── Warn (never block) ────────────────────────────────────────────────────
{
  printf '\n'
  printf '⚠ Next-steps audit: substantive turn (%d file edit(s), %d Bash step(s), %d chars) ended with no Next steps block.\n' \
    "$mutation_count" "$bash_count" "$text_len"
  printf '   meta/next-steps: close substantive work with <=3 ranked follow-ups + offer the top one.\n'
  printf '   If the task is genuinely closed, one honest line ("nothing pressing, ready to ship") satisfies it.\n'
  printf '   Suppress this turn with [skip-next-steps]. Disable: rm %s\n' "$state_file"
} >&2

exit 0
