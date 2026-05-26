---
name: skill-audit
description: Profile should be able to audit a profile's skills for gaps, overlaps, and unused entries
---

# Required capabilities

## Skills
- meta/skill-reviewer       # score individual skills
- meta/profile-optimizer    # find unused skills and suggest removals
- meta/skill-discovery      # identify what's missing after a session
- meta/skill-suggestion     # detect patterns that should be skills

## Commands (one of these)
- code-review               # review skill quality

## Playbooks (recommended)
- improve-existing-skill    # protocol for fixing weak skills found during audit

## Quality gates (recommended)
- skill-overlap-check.sh    # detect duplicates

## Trigger phrases the profile should handle
- "audit skills in this profile"
- "find weak skills"
- "what skills am I not using"
- "find skill gaps"
- "which skills overlap"

# Scoring
- 1 point per required skill present
- 1 point per recommended item present (playbooks, gates)
- 2 points if all trigger phrases are covered by some skill description
- Pass threshold: ≥ 50% of max possible
