#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"
ensure_temp_home

repo="$(fresh_repo 04-doctor-detects-drift)"
install_deps "$repo"

# Drift = a profile that declares a skill which isn't on disk. `cue doctor`
# flags this as a D1 (error-severity) issue and exits non-zero; `--fix` removes
# the dangling reference. (The old workspace-symlink model this scenario used
# predates the current architecture — materialization now lives in the runtime
# dir built at launch, and `cue use` is only a lightweight per-dir pin.)
mkdir -p "$repo/profiles/drift-e2e"
cat > "$repo/profiles/drift-e2e/profile.yaml" <<'YAML'
name: drift-e2e
description: E2E-only profile with an intentionally missing skill to prove doctor drift detection.
inherits: core
skills:
  local:
    - nonexistent/totally-not-a-real-skill
YAML

# doctor must detect the drift and exit non-zero (D1 is error-severity).
if cue "$repo" doctor > "$SOUL_E2E_WORK/04-doctor.out" 2>&1; then
  fail "cue doctor should exit non-zero when a profile declares a missing skill"
fi
grep -q "drift-e2e" "$SOUL_E2E_WORK/04-doctor.out" \
  || fail "doctor output did not name the drifting profile (drift-e2e)"

# --fix strips the dangling skill reference from the profile.
cue "$repo" doctor --fix > "$SOUL_E2E_WORK/04-doctor-fix.out" 2>&1 || true
grep -q "nonexistent/totally-not-a-real-skill" "$repo/profiles/drift-e2e/profile.yaml" \
  && fail "doctor --fix did not remove the missing skill reference"

log "doctor detects a missing-skill drift and --fix repairs it"
