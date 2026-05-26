# Playbook: Improve an Existing Skill

Use when the user says "improve this skill", "rewrite this skill", "this skill
is weak", "fix this skill", or when you encounter a skill scoring <3/5 during
an audit. Follow the steps in order.

## 1. Read the skill in full

```bash
cat resources/skills/skills/<category>/<name>/SKILL.md
```

Don't skim. Read every line — frontmatter, body, rules section. Note what's
there and what's missing.

## 2. Score it (1–5 activation + 0–10 completeness)

| Dimension | Question |
|-----------|----------|
| **Trigger** | Does `description:` contain a clear "when user says X" phrase? |
| **Steps** | Are steps concrete commands, not "consider doing X"? |
| **Scope** | Does it do one job, or is it trying to do 3+ things? |
| **Guardrails** | Is there a Rules section with clear boundaries? |
| **Frontmatter** | All fields populated? Prerequisites declared? |

For the 0–10 completeness score across 7 axes, see
[../skills/skills/meta/skill-reviewer/references/completeness.md](../skills/skills/meta/skill-reviewer/references/completeness.md).
Apply lake-vs-ocean framing: cheap, complete fixes go in the lake; multi-day
restructures get flagged as oceans and deferred.

Present: `Score: X/5 activation, Y/10 completeness — <main issue>`

## 3. Lint it

```bash
cue lint-skill resources/skills/skills/<category>/<name>/SKILL.md
```

Note all errors and warnings. Auto-fixable ones (R001, R005, R006) can be
fixed with `--fix`, but understand what changed.

## 4. Identify the single biggest problem

Pick ONE of:
- **Vague trigger** → rewrite `description:` to start with "When user says…"
- **Bloated scope** → split into 2-3 focused skills
- **Weak steps** → replace prose with bash commands and expected output
- **Missing guardrails** → add a Rules section with anti-patterns
- **Missing deps** → add `allowed-tools`, `requires_mcps`, Prerequisites

Fix the biggest problem first. Don't try to fix everything in one pass.

## 5. Rewrite (with a decision brief for non-trivial changes)

If the fix changes the trigger surface (description rewrite) or the scope
(split), show the user a D-numbered decision brief first. Format in
[../skills/skills/meta/skill-reviewer/references/decision-brief-format.md](../skills/skills/meta/skill-reviewer/references/decision-brief-format.md).
Cosmetic fixes (typos, R001) don't need a brief.

When you estimate effort, use the dual-scale convention (see
[../skills/skills/meta/skill-reviewer/references/voice.md](../skills/skills/meta/skill-reviewer/references/voice.md)):
"~2 min CC / ~30 min human." Makes the AI compression visible.

Apply the fix. Follow these constraints:
- Keep the same `name:` (renaming breaks profile references)
- Keep the same category/path
- If splitting, create new skills and update the profile's `skills.local` list
- Every step must have at least one code block
- Total length should stay under 150 lines unless justified
- Voice rules apply: no em dashes, no banned AI vocabulary

## 6. Lint again

```bash
cue lint-skill resources/skills/skills/<category>/<name>/SKILL.md
```

Zero errors before declaring done.

## 7. Check for collateral damage

If you changed the skill's trigger phrase or scope:
```bash
# Which profiles reference this skill?
grep -rl "<name>" profiles/*/profile.yaml
```

Verify the skill still fits those profiles. If scope narrowed, the profile
may need a companion skill to cover what was removed.

## 8. Capture learning (if applicable)

If the fix revealed something the next author of this skill should know
(a description phrasing that always under-triggers, a body pattern that
makes lint scream, a recurring weak skill in this profile), log it:

```bash
bin/cue-learnings log --type pitfall \
                     --key skill-improvement-<short-slug> \
                     --insight "<one-line description>" \
                     --confidence 1-10 \
                     --source observed
```

Convention:
[../skills/skills/meta/skill-reviewer/references/learnings.md](../skills/skills/meta/skill-reviewer/references/learnings.md).

## Anti-patterns to avoid

- Rewriting a skill you haven't fully read.
- Changing the `name:` field (breaks all profile references).
- "Improving" by adding more scope (that's bloating, not improving).
- Skipping the lint step after rewriting.
- Fixing cosmetic issues while ignoring a broken trigger.
