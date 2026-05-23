#!/usr/bin/env bash
# cue — one-line installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/recodeee/cue/main/get.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/recodeee/cue/main/get.sh | bash -s -- --yes
#
# What this does:
#   1. Installs bun (if missing)
#   2. Clones the cue repo to ~/Documents/cue (or CUE_DIR)
#   3. Runs install.sh inside the repo
#
# Environment variables:
#   CUE_DIR     — where to clone (default: ~/Documents/cue)
#   CUE_BRANCH  — git branch to clone (default: main)

set -euo pipefail

CUE_DIR="${CUE_DIR:-$HOME/Documents/cue}"
CUE_BRANCH="${CUE_BRANCH:-main}"
CUE_REPO="https://github.com/recodeee/cue.git"

if [ -t 2 ]; then
  GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; DIM='\033[2m'; BOLD='\033[1m'; RESET='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; DIM=''; BOLD=''; RESET=''
fi

say()  { printf '%s\n' "$*" >&2; }
ok()   { say "  ${GREEN}✓${RESET} $*"; }
warn() { say "  ${YELLOW}!${RESET} $*"; }
die()  { say "  ${RED}✗${RESET} $*"; exit 1; }

say ""
say "${BOLD}cue${RESET} — Agent Profile Manager for Claude Code & Codex"
say "${DIM}https://github.com/recodeee/cue${RESET}"
say ""

# 1. Check/install git
if ! command -v git >/dev/null 2>&1; then
  die "git is required. Install it first:
     macOS:  xcode-select --install
     Ubuntu: sudo apt install git
     Fedora: sudo dnf install git"
fi

# 2. Check/install bun
if ! command -v bun >/dev/null 2>&1; then
  say "${DIM}Installing bun...${RESET}"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    die "bun install failed. Install manually from https://bun.sh and re-run."
  fi
  ok "bun installed"
else
  ok "bun $(bun --version) found"
fi

# 3. Clone or update the repo
if [ -d "$CUE_DIR/.git" ]; then
  say "${DIM}Updating existing repo at $CUE_DIR...${RESET}"
  cd "$CUE_DIR"
  git pull --ff-only origin "$CUE_BRANCH" 2>/dev/null || git fetch origin "$CUE_BRANCH"
  ok "repo updated"
else
  say "${DIM}Cloning cue to $CUE_DIR...${RESET}"
  git clone --depth 1 --branch "$CUE_BRANCH" "$CUE_REPO" "$CUE_DIR"
  ok "cloned to $CUE_DIR"
fi

# 4. Run the real installer
say ""
exec "$CUE_DIR/install.sh" "$@"
