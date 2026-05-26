---
name: skill-improvement
description: Profile should be able to score a weak skill, identify issues, and rewrite it to pass lint
---

# Required capabilities

## Skills
- meta/skill-reviewer       # score and identify issues
- meta/cue-usage            # knows cue lint-skill command

## Commands (one of these)
- code-review               # review the rewritten skill

## Playbooks (recommended)
- improve-existing-skill    # the canonical protocol for improving skills

## Quality gates (recommended)
- lint-skill-pass.sh        # lint must pass after rewrite

## Trigger phrases the profile should handle
- "improve this skill"
- "rewrite this skill"
- "this skill is weak"
- "fix this skill"
- "score this skill"

# Scoring
- 1 point per required skill present
- 1 point per recommended item present (playbooks, gates)
- 2 points if all trigger phrases are covered by some skill description
- Pass threshold: ≥ 50% of max possible
