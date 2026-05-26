---
name: skill-writing
description: Profile should be able to write, review, and lint a SKILL.md end-to-end
---

# Required capabilities

## Skills
- meta/skill-reviewer            # review and score existing skills
- meta/description-optimizer     # optimize the trigger surface
- meta/cli-writer                # declare CLI dependencies
- meta/skill-suggestion          # detect patterns that should become skills
- meta/cue-usage                 # knows cue commands (lint-skill, skills search)

## Commands (one of these)
- code-review                    # review skill file quality

## Playbooks (recommended)
- write-skill-from-scratch       # canonical protocol for writing skills
- improve-existing-skill         # canonical protocol for improving skills

## Quality gates (recommended)
- lint-skill-pass.sh             # lint must pass before claiming done
- skill-overlap-check.sh         # surface near-duplicates before they ship

## Shared references the profile should know
- meta/skill-reviewer/references/decision-brief-format.md
- meta/skill-reviewer/references/voice.md
- meta/skill-reviewer/references/completeness.md

## Trigger phrases the profile should handle
- "write a skill for X"
- "review this skill"
- "scaffold a new skill"
- "audit skills in this profile"
- "find a skill for X"
- "optimize this description"
- "why isn't this skill triggering"

# Scoring
- 1 point per required skill present
- 1 point per recommended item present (playbooks, gates)
- 1 point per shared reference file present
- 2 points if all trigger phrases are covered by some skill description
- 1 point if profile persona references the voice rules (no em dashes etc)
- Pass threshold: ≥ 60% of max possible
