#!/usr/bin/env bash
# PreToolUse:Write|Edit guard for SKILL.md files.
#
# Validates that any write to a SKILL.md file includes required frontmatter
# fields: name, description. Warns on missing tags/category.
#
# Exit 0 = allow, exit 2 = block.
set -euo pipefail

payload="$(cat -)"

# Extract file path from hook payload
target="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    ti=d.get("tool_input",{})
    print(ti.get("file_path","") or ti.get("path",""))
except Exception: pass' 2>/dev/null)"

if [[ -z "$target" ]]; then exit 0; fi

# Only care about SKILL.md files
if [[ "$(basename "$target")" != "SKILL.md" ]]; then exit 0; fi

# Extract the content being written
content="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    ti=d.get("tool_input",{})
    print(ti.get("content","") or ti.get("new_str",""))
except Exception: pass' 2>/dev/null)"

# If no content (e.g. a delete or rename), allow
if [[ -z "$content" ]]; then exit 0; fi

# Check for frontmatter delimiters
if ! printf '%s' "$content" | head -1 | grep -q '^---'; then
  >&2 echo "cue:skill-frontmatter-guard blocked: SKILL.md must start with --- frontmatter"
  >&2 echo "  Required: name, description"
  exit 2
fi

# Check required fields
missing=()
if ! printf '%s' "$content" | grep -q '^name:'; then
  missing+=("name")
fi
if ! printf '%s' "$content" | grep -q '^description:'; then
  # Also check indented description (multi-line yaml)
  if ! printf '%s' "$content" | grep -q '^description:'; then
    missing+=("description")
  fi
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  >&2 echo "cue:skill-frontmatter-guard blocked: SKILL.md missing required frontmatter: ${missing[*]}"
  >&2 echo "  Every SKILL.md needs at minimum: name, description"
  exit 2
fi

# Warn (but don't block) on missing optional fields
if ! printf '%s' "$content" | grep -q '^tags:'; then
  >&2 echo "cue:skill-frontmatter-guard warning: missing 'tags:' field (recommended)"
fi

exit 0
