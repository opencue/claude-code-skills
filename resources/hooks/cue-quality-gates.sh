#!/usr/bin/env bash
# Stop-hook runner: executes every script under <runtime>/quality-gates/
# sequentially. If any gate exits non-zero, this script exits 2 — vetoing
# the Stop and signalling to Claude that work isn't actually done.
#
# Profiles opt in by adding `qualityGates: [tests-pass, ...]` to profile.yaml.
# The materializer symlinks those scripts into <runtime>/quality-gates/ and
# auto-injects the Stop hook that points here (no manual `hooks:` entry
# needed when `qualityGates` is non-empty).
#
# Side effects beyond veto:
#   - Persists results to ~/.config/cue/gate-status/<profile>.json so
#     `cue gates status` can display them and the next session can warm-start.
#   - Updates the tmux pane option `@cue_health` to "" (clean) or "⚠"
#     (failed) so status lines reflect post-Stop state live.
#
# Env contract:
#   CLAUDE_CONFIG_DIR  — runtime root materialized by cue
#   CUE_PROFILE        — composite profile selector (set by `cue launch`)
#   TMUX_PANE          — when set, we'll set-option -p @cue_health on it
#   CUE_GATES_TIMEOUT  — per-gate timeout in seconds (default 120)
set -uo pipefail

GATE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/quality-gates"
PROFILE="${CUE_PROFILE:-unknown}"
STATUS_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/cue/gate-status"
STATUS_FILE="$STATUS_ROOT/${PROFILE//[^A-Za-z0-9_+-]/_}.json"
TIMEOUT="${CUE_GATES_TIMEOUT:-120}"

mkdir -p "$STATUS_ROOT"

set_tmux_health() {
  local val="$1"
  [[ -z "${TMUX_PANE:-}" ]] && return 0
  command -v tmux >/dev/null 2>&1 || return 0
  tmux set-option -p -t "$TMUX_PANE" "@cue_health" "$val" >/dev/null 2>&1 || true
}

write_status() {
  # $1 = "pass" | "fail" | "skip"
  # $2 = json array of result objects (already comma-separated, no outer brackets)
  local overall="$1"
  local results_inner="$2"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat > "$STATUS_FILE" <<EOF
{
  "ts": "$ts",
  "profile": "$PROFILE",
  "overall": "$overall",
  "results": [$results_inner]
}
EOF
}

json_escape() {
  # Minimal JSON string escape (quote, backslash, control chars). Good
  # enough for gate names + first-N bytes of stderr. Avoids shelling jq.
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

if [[ ! -d "$GATE_DIR" ]]; then
  # No gates declared for this profile — nothing to enforce.
  write_status "skip" ""
  set_tmux_health ""
  exit 0
fi

shopt -s nullglob
gates=("$GATE_DIR"/*)
shopt -u nullglob

if [[ ${#gates[@]} -eq 0 ]]; then
  write_status "skip" ""
  set_tmux_health ""
  exit 0
fi

failed=()
results_parts=()
for gate in "${gates[@]}"; do
  [[ -x "$gate" || "$gate" == *.sh ]] || continue
  name="$(basename "$gate")"
  out_buf="$(mktemp)"
  err_buf="$(mktemp)"
  # Capture both streams instead of passing through. Gates with verbose
  # success output (linters, overlap checkers) drowned the side panel.
  # On failure we still surface what they said.
  if command -v timeout >/dev/null 2>&1; then
    timeout "$TIMEOUT" bash "$gate" >"$out_buf" 2>"$err_buf"
    rc=$?
  else
    bash "$gate" >"$out_buf" 2>"$err_buf"
    rc=$?
  fi
  err_msg="$(head -c 2048 "$err_buf" 2>/dev/null || true)"
  out_msg="$(head -c 2048 "$out_buf" 2>/dev/null || true)"
  rm -f "$out_buf" "$err_buf"
  ok_bool="true"
  if [[ $rc -ne 0 ]]; then
    failed+=("$name")
    ok_bool="false"
    [[ -n "$out_msg" ]] && >&2 printf '%s\n' "$out_msg"
    [[ -n "$err_msg" ]] && >&2 printf '%s\n' "$err_msg"
  fi
  results_parts+=("$(printf '{"name":"%s","ok":%s,"exit":%d,"stderr":"%s"}' \
    "$(json_escape "$name")" "$ok_bool" "$rc" "$(json_escape "$err_msg")")")
done

results_inner="$(IFS=,; printf '%s' "${results_parts[*]}")"

if [[ ${#failed[@]} -gt 0 ]]; then
  write_status "fail" "$results_inner"
  set_tmux_health "⚠"
  >&2 echo ""
  >&2 echo "cue:quality-gates BLOCKED Stop — these gates failed:"
  for f in "${failed[@]}"; do >&2 echo "  ✗ $f"; done
  >&2 echo ""
  >&2 echo "Fix them, then end the session normally."
  >&2 echo "Inspect: cue gates status"
  exit 2
fi

write_status "pass" "$results_inner"
set_tmux_health ""
exit 0
