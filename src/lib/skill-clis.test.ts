/**
 * Tests for CLI extraction from SKILL.md frontmatter, the data behind the
 * studio's "CLIs" tab. Recipe enrichment runs against the real on-disk
 * cli-recipes.json.
 */

import { describe, expect, test } from "bun:test";

import {
  extractClisFromContent,
  cliInstallHint,
  hasRecipe,
  aggregateProfileClis,
} from "./skill-clis";

const SKILL = (allowed: string) =>
  `---\nname: demo\nallowed-tools: ${allowed}\n---\n\n# demo\n\nBody mentions Bash(should-not-leak:*) outside frontmatter.\n`;

describe("extractClisFromContent", () => {
  test("pulls tool names out of Bash(...) frontmatter refs", () => {
    const clis = extractClisFromContent(SKILL("Bash(cargo:*), Bash(gh:*), Bash(curl:*)"));
    expect(clis).toEqual(["cargo", "gh", "curl"]);
  });

  test("drops shell builtins, coreutils, and Claude tool names", () => {
    const clis = extractClisFromContent(SKILL("Bash(Bash:*), Bash(Read:*), Bash(-:*), Bash(ls:*), Bash(grep:*), Bash(cargo:*)"));
    expect(clis).toEqual(["cargo"]);
  });

  test("takes the first token of a multi-word command", () => {
    const clis = extractClisFromContent(SKILL("Bash(npx medusa db:generate:*)"));
    expect(clis).toEqual(["npx"]);
  });

  test("dedupes repeated tools, preserves first-seen casing", () => {
    const clis = extractClisFromContent(SKILL("Bash(Cargo:*), Bash(cargo:*)"));
    expect(clis).toEqual(["Cargo"]);
  });

  test("ignores Bash(...) that appears only in the body", () => {
    const noFront = "# demo\n\nrun Bash(docker:*) here\n";
    expect(extractClisFromContent(noFront)).toEqual([]);
  });

  test("returns [] when there's no allowed-tools", () => {
    expect(extractClisFromContent("---\nname: demo\n---\n\n# demo\n")).toEqual([]);
  });
});

describe("extractClisFromContent — Prerequisites + body sources", () => {
  test("picks up a recipe tool from a ## Prerequisites table, even without frontmatter", () => {
    const md = "---\nname: demo\n---\n\n# demo\n\n## Prerequisites\n\n| Tool | Install |\n|---|---|\n| `nmap` | `apt install nmap` |\n\n## Steps\n";
    expect(extractClisFromContent(md)).toContain("nmap");
  });

  test("ignores non-recipe backticked tokens in Prerequisites (precision)", () => {
    const md = "---\nname: demo\n---\n\n## Prerequisites\n\n- `totally-made-up-tool` — install somehow\n";
    expect(extractClisFromContent(md)).toEqual([]);
  });

  test("catches a recipe tool used in command position in the body", () => {
    const md = "---\nname: demo\n---\n\n# demo\n\nRun the suite:\n\n```bash\n$ cargo nextest run\n```\n";
    expect(extractClisFromContent(md)).toContain("cargo");
  });

  test("does NOT catch a recipe tool name used as prose (precision)", () => {
    const md = "---\nname: demo\n---\n\n# demo\n\nWe use cargo culting sparingly and just move on.\n";
    // "cargo" mid-sentence and "just" mid-sentence are prose, not commands.
    expect(extractClisFromContent(md)).toEqual([]);
  });

  test("prefers the longest recipe key at a position (cargo-nextest over cargo)", () => {
    const md = "---\nname: demo\n---\n\n```\n$ cargo-nextest run\n```\n";
    const clis = extractClisFromContent(md);
    expect(clis).toContain("cargo-nextest");
    expect(clis).not.toContain("cargo");
  });
});

describe("cli-recipes enrichment", () => {
  test("known tools resolve an install hint", () => {
    // nmap is a stable entry in cli-recipes.json (apt/brew/...).
    expect(hasRecipe("nmap")).toBe(true);
    expect(cliInstallHint("nmap")).toMatch(/nmap/);
  });

  test("unknown tools have no recipe and an empty hint", () => {
    expect(hasRecipe("definitely-not-a-cli-xyz")).toBe(false);
    expect(cliInstallHint("definitely-not-a-cli-xyz")).toBe("");
  });
});

describe("aggregateProfileClis", () => {
  test("unions across skills, ranks by usage, records usedBy", () => {
    const skills = [
      { id: "rust/a", body: SKILL("Bash(cargo:*), Bash(rustup:*)") },
      { id: "rust/b", body: SKILL("Bash(cargo:*)") },
      { id: "ops/c", body: SKILL("Bash(gh:*)") },
    ];
    const clis = aggregateProfileClis(skills);
    // cargo (2 users) ranks first
    expect(clis[0]!.name).toBe("cargo");
    expect(clis[0]!.usedBy).toEqual(["rust/a", "rust/b"]);
    expect(clis.map((c) => c.name).sort()).toEqual(["cargo", "gh", "rustup"]);
  });

  test("skips missing (unresolved) skills", () => {
    const clis = aggregateProfileClis([
      { id: "x", body: SKILL("Bash(cargo:*)"), missing: true },
    ]);
    expect(clis).toEqual([]);
  });
});
