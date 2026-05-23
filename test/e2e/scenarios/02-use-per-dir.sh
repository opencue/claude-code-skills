#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.."; pwd)/lib.sh"
ensure_temp_home

repo="$(fresh_repo 02-use-per-dir)"
install_deps "$repo"
require_profile "$repo" "medusa-dev"

# Skip if 'use' is not yet implemented
output="$(soul "$repo" use medusa-dev 2>&1)" || true
if echo "$output" | grep -q "not yet implemented"; then
  log "SKIP: 'use' command not yet implemented"
  exit 0
fi

workspace="$repo/profiles/medusa-dev/workspace"
assert_dir "$workspace"
assert_file "$workspace/.mcp.json"
assert_file "$workspace/CLAUDE.md"
assert_file "$workspace/AGENTS.md"
assert_symlink_tree_ok "$workspace/.claude/skills"

(
  cd "$workspace"
  [ -f .mcp.json ] || fail "workspace missing .mcp.json"
)

log "use medusa-dev creates workspace with expected files"
