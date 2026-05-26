#!/usr/bin/env bash
# Quality gate: check for skill overlap before declaring done.
#
# Finds SKILL.md files modified in the working tree, extracts their keywords
# from name/description/tags, and searches for existing skills with >70%
# keyword overlap. Warns but does not block (exit 0) — overlap is a judgment
# call, not an absolute rule.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Find modified SKILL.md files
changed_skills=()
while IFS= read -r file; do
  [[ -n "$file" ]] && changed_skills+=("$file")
done < <(git diff --name-only HEAD 2>/dev/null | grep 'SKILL\.md$' || true)

while IFS= read -r file; do
  [[ -n "$file" ]] && changed_skills+=("$file")
done < <(git diff --cached --name-only 2>/dev/null | grep 'SKILL\.md$' || true)

# Dedupe
mapfile -t changed_skills < <(printf '%s\n' "${changed_skills[@]}" | sort -u)

if [[ ${#changed_skills[@]} -eq 0 ]]; then
  exit 0
fi

warned=0

for skill_file in "${changed_skills[@]}"; do
  [[ -f "$skill_file" ]] || continue

  # Extract skill name from frontmatter
  skill_name="$(grep -m1 '^name:' "$skill_file" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '"' || true)"
  if [[ -z "$skill_name" ]]; then continue; fi

  # Extract keywords from description and tags
  keywords="$(sed -n '/^---$/,/^---$/p' "$skill_file" | grep -E '^(description|tags):' | \
    sed 's/^[^:]*:[[:space:]]*//' | tr '[],"' ' ' | tr '-' ' ' | \
    tr '[:upper:]' '[:lower:]' | tr ' ' '\n' | sort -u | grep -v '^$' | head -20 || true)"

  if [[ -z "$keywords" ]]; then continue; fi

  # Search other skills for overlap (exclude self)
  skill_dir="$(dirname "$skill_file")"
  matches=""
  while IFS= read -r keyword; do
    [[ -z "$keyword" ]] && continue
    [[ ${#keyword} -lt 4 ]] && continue  # skip short words
    hits="$(grep -rl "$keyword" resources/skills/skills/*/SKILL.md resources/skills/skills/*/*/SKILL.md 2>/dev/null | \
      grep -v "$skill_file" | head -5 || true)"
    if [[ -n "$hits" ]]; then
      matches+="$hits"$'\n'
    fi
  done <<< "$keywords"

  if [[ -z "$matches" ]]; then continue; fi

  # Count how many unique skills matched on 3+ keywords
  overlap_skills="$(printf '%s\n' "$matches" | sort | uniq -c | sort -rn | awk '$1 >= 3 {print $2}' | head -3)"

  if [[ -n "$overlap_skills" ]]; then
    warned=1
    >&2 echo "[quality-gate:skill-overlap-check] ⚠️  Potential overlap for '$skill_name':"
    while IFS= read -r overlap_file; do
      [[ -z "$overlap_file" ]] && continue
      overlap_name="$(grep -m1 '^name:' "$overlap_file" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '"' || true)"
      >&2 echo "    → $overlap_name ($overlap_file)"
    done <<< "$overlap_skills"
    >&2 echo "    Review these for duplication before shipping."
  fi
done

if [[ $warned -ne 0 ]]; then
  >&2 echo ""
  >&2 echo "[quality-gate:skill-overlap-check] Overlap detected — review above. Allowing (warning only)."
fi

# Always exit 0 — overlap is advisory, not blocking
exit 0
