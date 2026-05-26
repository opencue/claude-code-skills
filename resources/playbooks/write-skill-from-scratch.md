# Playbook: Write a Skill from Scratch

Use when the user says "write a skill for X", "create a new skill", "scaffold
a skill", or when a repeatable pattern emerges that should become a skill.
Follow the steps in order. Skipping the overlap check is how duplicates ship.

## Iron contract — never half-publish a skill

A broken or half-finished SKILL.md in a profile makes the agent reach for
the wrong tool and erodes user trust. This playbook writes the new skill,
runs `cue lint-skill` against it, and only registers it in the target
profile after a user confirmation. If lint fails or the user says no,
the skill directory comes out clean. There is no "almost shipped" state.

## 1. Identify the pattern (one sentence)

Compress the need into one sentence:
- "When user says X, do Y using Z."
- If you can't compress it, the scope is too broad — split first.

## 2. Check for existing overlap (three-layer search)

The 1000x engineer's first instinct is "has someone already solved this?"
not "let me design it from scratch." Search three layers before writing:

- **Layer 1 (tried-and-true):** does cue already have a skill for this?
- **Layer 2 (new-and-popular):** does anthropics/skills, gstack, or a
  community marketplace have one?
- **Layer 3 (first principles):** if everyone solves this differently, is
  there a reason the conventional approach is wrong for our user?

```bash
# Search local skills
grep -rl "<keyword>" resources/skills/skills/ | head -10

# Search via cue
cue skills search "<keyword>" 2>/dev/null

# Check upstream
gh search code "filename:SKILL.md <keyword>" --limit 5 2>/dev/null
```

If a skill already covers >70% of the need, **improve it** instead of creating
a new one. If it covers ~40%, extend it with a new section.

If layer-3 reasoning reveals a real reason to depart from the conventional
approach (every existing skill assumes X but our user works in a context
where X is false), name the **Eureka** explicitly in your scaffolded
SKILL.md body — one sentence in the opening paragraph: "Most skills for
this assume X. Ours doesn't because Y." That sentence is the skill's
reason to exist.

## 3. Pick category and name

- Category = the domain (`meta`, `review`, `deployment`, `research`, etc.)
- Name = verb-noun or noun (`skill-reviewer`, `code-review`, `docker-deploy`)
- Path: `resources/skills/skills/<category>/<name>/SKILL.md`

```bash
mkdir -p resources/skills/skills/<category>/<name>
```

## 4. Write the frontmatter

```yaml
---
name: <name>
description: >-
  When user says "<trigger1>", "<trigger2>", or "<trigger3>".
  <One sentence of what it does>.
tags: [<category>, <domain>]
category: <category>
version: 1.0.0
requires_mcps: []
allowed-tools: Bash
---
```

Rules:
- `description` must start with "When user says" or "Use when"
- Keep under 200 chars (R003)
- List every binary in `allowed-tools` that the skill shells out to

## 5. Write the body — trigger-first, bash-first

Structure:
1. **One paragraph** — what this skill does and why
2. **When to activate** — bullet list of triggers (user phrases + context triggers)
3. **Steps** — numbered, each with a verb-phrase heading and concrete commands
4. **Rules** — boundaries, anti-patterns, when NOT to use this skill

Every step must contain at least one code block or concrete file-edit instruction.
No "consider doing X" — either do it or don't mention it.

## 6. Declare dependencies

- If it shells out to a CLI → add to `allowed-tools` frontmatter
- If the CLI isn't in `resources/cli-recipes.json` → use the `cli-writer` skill to add it
- If it calls MCP tools → add to `requires_mcps` frontmatter
- Add a `## Prerequisites` section with install commands per platform

## 7. Lint (atomic gate — must pass before profile wiring)

```bash
cue lint-skill resources/skills/skills/<category>/<name>/SKILL.md
```

Fix all errors (R001, R005, R006 are auto-fixable with `--fix`). Warnings
should be addressed manually. Don't ship with lint errors.

If lint still fails after one round of fixes, **delete the skill directory
and stop**. Surface the failure to the user with the lint output. A skill
that fails lint is worse than no skill — it triggers, then misbehaves.
There is no half-staged state.

## 8. Approval gate (D-numbered brief)

Lint passes. Before wiring into the profile, show the user a decision
brief (see
[../skills/skills/meta/skill-reviewer/references/decision-brief-format.md](../skills/skills/meta/skill-reviewer/references/decision-brief-format.md)):

```
D<N> — Register <skill-name> in <profile> profile?
Project/branch/task: scaffolding a new skill for "<one-line need>".
ELI10: I wrote a new skill at resources/skills/skills/<category>/<name>/.
Lint passed. Saying yes adds it to the <profile> profile so the agent will
trigger it on phrases like "<trigger1>", "<trigger2>". Saying no leaves the
SKILL.md on disk but no profile loads it.
Stakes if we pick wrong: yes means the skill goes live for everyone using
that profile (false positives are visible); no means the skill exists but
nothing routes to it (silent dead code).
Recommendation: A — register it. Lint is clean and the trigger surface
is narrow.
A) Register in <profile> profile (recommended)
B) Look at the SKILL.md first (I'll print it and re-ask)
C) Leave unregistered — I'll wire it manually later
```

## 9. Wire into the target profile

```bash
# Add to the appropriate profile
# Edit profiles/<target>/profile.yaml → skills.local list
```

If unsure which profile, use the `profile-suggest` skill or ask the user.

## 10. Verify the trigger

Mentally (or actually) test: "If a user said the trigger phrase, would this
skill activate and produce a useful result?" If not, rewrite the description.

## 11. Capture a learning (if applicable)

If you discovered something non-obvious while writing this skill (a trigger
phrasing the agent kept missing, an existing skill that almost-but-not-quite
covered the need, a cli-recipe quirk), log it for future sessions:

```bash
bin/cue-learnings log --type <pattern|pitfall|tool> \
                     --key skill-writing-<short-slug> \
                     --insight "<one-line description>" \
                     --confidence 1-10 \
                     --source observed
```

Convention details:
[../skills/skills/meta/skill-reviewer/references/learnings.md](../skills/skills/meta/skill-reviewer/references/learnings.md).
Don't log obvious facts. A good test: would the next agent in this repo
save 5+ minutes by knowing this? If yes, log it.

## Anti-patterns to avoid

- Writing a skill that does 5 things (split it).
- Vague triggers like "when working with code" (too broad — every skill matches).
- Steps that say "you might want to" (either do it or don't).
- Missing `allowed-tools` for CLIs the skill uses.
- Shipping without running `cue lint-skill`.
- Creating a near-duplicate of an existing skill instead of improving it.
- Wiring an unlinted skill into a profile (violates the iron contract above).
- Picking a description rewrite without showing a decision brief.
