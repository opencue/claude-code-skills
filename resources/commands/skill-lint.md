---
description: Lint SKILL.md files — pass a path, or lint all modified skills in the working tree
argument-hint: [path/to/SKILL.md | --all | blank for git-modified]
---

# Skill Lint

**Input**: $ARGUMENTS

## Mode Selection

If `$ARGUMENTS` contains a file path:
→ Lint that specific file.

If `$ARGUMENTS` is `--all`:
→ Lint every SKILL.md under `resources/skills/skills/`.

If `$ARGUMENTS` is empty:
→ Lint only SKILL.md files modified in the git working tree.

## Execution

### Single file

```bash
cue lint-skill "$ARGUMENTS"
```

### All skills

```bash
find resources/skills/skills -name "SKILL.md" -exec cue lint-skill {} \; 2>&1 | grep -E "(✓|⚠|✗|error|warning)"
```

### Git-modified only

```bash
git diff --name-only HEAD | grep 'SKILL\.md$' | while read -r f; do
  echo "--- $f ---"
  cue lint-skill "$f"
done
```

## After lint

- If errors found: show the fix command (`cue lint-skill <path> --fix` for R001/R005/R006)
- If warnings found: list them with one-line fix suggestions
- If clean: report `✅ All SKILL.md files pass lint`
