import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseAllowedTools, validateToolUsage, generateSandboxReport } from "./skill-sandbox";

const TEST_ROOT = join(import.meta.dir, "..", "..", "__test_sandbox__");

beforeAll(() => {
  process.env.CUE_REPO_ROOT = join(TEST_ROOT, "repo");
  const skillsRoot = join(TEST_ROOT, "repo", "resources", "skills", "skills");

  // Skill with Bash(*) — high risk
  mkdirSync(join(skillsRoot, "meta", "shell-master"), { recursive: true });
  writeFileSync(join(skillsRoot, "meta", "shell-master", "SKILL.md"), `---
name: shell-master
description: "Unrestricted shell"
allowed-tools: Bash(*)
---
# Shell Master
`);

  // Skill with specific Bash — medium risk
  mkdirSync(join(skillsRoot, "medusa", "db-gen"), { recursive: true });
  writeFileSync(join(skillsRoot, "medusa", "db-gen", "SKILL.md"), `---
name: db-gen
description: "DB generate"
allowed-tools: Bash(npx medusa db:generate:*)
---
# DB Gen
`);

  // Skill with Read/Write only — low risk
  mkdirSync(join(skillsRoot, "review", "code-review"), { recursive: true });
  writeFileSync(join(skillsRoot, "review", "code-review", "SKILL.md"), `---
name: code-review
description: "Code review"
allowed-tools: [Read, Write]
---
# Code Review
`);

  // Skill with no allowed-tools — medium risk
  mkdirSync(join(skillsRoot, "meta", "no-tools"), { recursive: true });
  writeFileSync(join(skillsRoot, "meta", "no-tools", "SKILL.md"), `---
name: no-tools
description: "No tools declared"
---
# No Tools
`);

  // Skill with multiple Bash patterns
  mkdirSync(join(skillsRoot, "design", "wedding"), { recursive: true });
  writeFileSync(join(skillsRoot, "design", "wedding", "SKILL.md"), `---
name: wedding
description: "Wedding invitations"
allowed-tools: Bash(chromium:*), Bash(node:*), Bash(git:*)
---
# Wedding
`);
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  delete process.env.CUE_REPO_ROOT;
});

describe("parseAllowedTools", () => {
  test("parses array format", () => {
    const tools = parseAllowedTools(join(TEST_ROOT, "repo", "resources", "skills", "skills", "review", "code-review", "SKILL.md"));
    expect(tools).toEqual(["Read", "Write"]);
  });

  test("parses single value", () => {
    const tools = parseAllowedTools(join(TEST_ROOT, "repo", "resources", "skills", "skills", "meta", "shell-master", "SKILL.md"));
    expect(tools).toEqual(["Bash(*)"]);
  });

  test("parses comma-separated without brackets", () => {
    const tools = parseAllowedTools(join(TEST_ROOT, "repo", "resources", "skills", "skills", "design", "wedding", "SKILL.md"));
    expect(tools).toEqual(["Bash(chromium:*)", "Bash(node:*)", "Bash(git:*)"]);
  });

  test("returns empty for no allowed-tools", () => {
    const tools = parseAllowedTools(join(TEST_ROOT, "repo", "resources", "skills", "skills", "meta", "no-tools", "SKILL.md"));
    expect(tools).toEqual([]);
  });

  test("returns empty for nonexistent file", () => {
    expect(parseAllowedTools("/nonexistent/SKILL.md")).toEqual([]);
  });
});

describe("validateToolUsage", () => {
  test("allows exact match", () => {
    const result = validateToolUsage("test", "Read", ["Read", "Write"]);
    expect(result.allowed).toBe(true);
  });

  test("rejects unlisted tool", () => {
    const result = validateToolUsage("test", "Bash(rm:*)", ["Read", "Write"]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowed-tools");
  });

  test("Bash(*) allows any Bash usage", () => {
    const result = validateToolUsage("test", "Bash(git:status)", ["Bash(*)"]);
    expect(result.allowed).toBe(true);
  });

  test("Bash(git:*) allows git subcommands", () => {
    const result = validateToolUsage("test", "Bash(git:commit)", ["Bash(git:*)"]);
    expect(result.allowed).toBe(true);
  });

  test("Bash(git:*) rejects non-git", () => {
    const result = validateToolUsage("test", "Bash(rm:file)", ["Bash(git:*)"]);
    expect(result.allowed).toBe(false);
  });

  test("empty allowed-tools means implicit full access", () => {
    const result = validateToolUsage("test", "Bash(anything)", []);
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("implicit full access");
  });
});

describe("auditSkillPermissions", () => {
  test("assigns correct risk levels", () => {
    process.env.CUE_REPO_ROOT = join(TEST_ROOT, "repo");
    const report = generateSandboxReport(["meta/shell-master", "medusa/db-gen", "review/code-review", "meta/no-tools"]);
    expect(report).toContain("HIGH RISK");
    expect(report).toContain("MEDIUM RISK");
    expect(report).toContain("LOW RISK");
  });
});
