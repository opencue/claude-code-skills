#!/usr/bin/env bash
# Publish cue as a skill on Smithery's registry.
# Run: ./scripts/publish-smithery.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Publishing cue to Smithery skill registry..."

# Check smithery CLI
if ! command -v smithery >/dev/null 2>&1; then
  echo "Error: smithery CLI not installed. Run: npm install -g @smithery/cli"
  exit 1
fi

# Check auth
if ! smithery auth whoami >/dev/null 2>&1; then
  echo "Error: not authenticated. Run: smithery auth login"
  exit 1
fi

# Add the skill
smithery skill add recodeee/cue --agent claude-code

echo ""
echo "✅ Published to Smithery!"
echo "   View: https://smithery.ai/skills/recodeee/cue"
echo ""
echo "Users can now install with:"
echo "   smithery skill add recodeee/cue --agent claude-code"
echo "   npx skills add recodeee/cue -a claude-code -y"
