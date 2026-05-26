#!/usr/bin/env bash
# Quality gate: all modified SKILL.md files must pass cue lint-skill.
#
# Finds SKILL.md files changed in the working tree (staged + unstaged) and
# runs `cue lint-skill` on each. Exits 0 if no SKILL.md files were touched
# (so non-skill sessions don't block). Exits 2 if any lint errors are found.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Find modified SKILL.md files (staged + unstaged)
changed_skills=()
while IFS= read -r file; do
  [[ -n "$file" ]] && changed_skills+=("$file")
done < <(git diff --name-only HEAD 2>/dev/null | grep 'SKILL\.md$' || true)

while IFS= read -r file; do
  [[ -n "$file" ]] && changed_skills+=("$file")
done < <(git diff --cached --name-only 2>/dev/null | grep 'SKILL\.md$' || true)

# Dedupe
mapfile -t changed_skills < <(printf '%s\n' "${changed_skills[@]}" | sort -u)

# Nothing to lint — pass
if [[ ${#changed_skills[@]} -eq 0 ]]; then
  exit 0
fi

# Check if cue is available
if ! command -v cue >/dev/null 2>&1; then
  >&2 echo "[quality-gate:lint-skill-pass] cue not found, skipping"
  exit 0
fi

failed=0
for skill in "${changed_skills[@]}"; do
  if [[ -f "$skill" ]]; then
    >&2 echo "[quality-gate:lint-skill-pass] linting $skill..."
    if ! cue lint-skill "$skill" >&2 2>&1; then
      failed=1
    fi
  fi
done

if [[ $failed -ne 0 ]]; then
  >&2 echo "[quality-gate:lint-skill-pass] BLOCKED: one or more SKILL.md files have lint errors"
  >&2 echo "  Fix with: cue lint-skill <path> --fix"
  exit 2
fi

exit 0
