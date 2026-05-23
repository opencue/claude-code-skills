#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"
ensure_temp_home

repo="$(fresh_repo 01-fresh-install)"
install_deps "$repo"

count="$(profile_count "$repo")"
[ "$count" -ge "15" ] || fail "expected 15+ shipped profiles, found $count"

output="$SOUL_E2E_WORK/01-list.txt"
soul "$repo" list > "$output"

for profile in $EXPECTED_PROFILES; do
  grep -F "$profile" "$output" >/dev/null || fail "soul list did not include $profile"
done

log "fresh install lists all shipped profiles"
