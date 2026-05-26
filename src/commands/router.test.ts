/**
 * Tests for `cue router`. Uses --no-color to keep snapshots ANSI-free.
 * Profiles + skills are built in a sandboxed CUE_PROFILES_DIR / CUE_REPO_ROOT.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run as routerRun } from "./router";

let root: string;
let profilesDir: string;
let skillsRoot: string;
let configsRoot: string;
let priorRepo: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cue-router-cmd-"));
  profilesDir = join(root, "profiles");
  skillsRoot = join(root, "resources", "skills", "skills");
  configsRoot = join(root, "resources", "mcps", "configs");
  await mkdir(profilesDir, { recursive: true });
  await mkdir(skillsRoot, { recursive: true });
  await mkdir(configsRoot, { recursive: true });
  // Minimal sanitized registry — needed by profile-loader's resolver paths.
  await writeFile(
    join(configsRoot, "claude.sanitized.json"),
    JSON.stringify({ server_key: "mcpServers", servers: {} }),
  );
  await writeFile(
    join(configsRoot, "codex.sanitized.json"),
    JSON.stringify({ server_key: "mcp_servers", servers: {} }),
  );
  process.env.CUE_PROFILES_DIR = profilesDir;
  process.env.SOUL_PROFILES_DIR = profilesDir;
  priorRepo = process.env.CUE_REPO_ROOT;
  process.env.CUE_REPO_ROOT = root;
});

afterEach(async () => {
  delete process.env.CUE_PROFILES_DIR;
  delete process.env.SOUL_PROFILES_DIR;
  if (priorRepo === undefined) delete process.env.CUE_REPO_ROOT;
  else process.env.CUE_REPO_ROOT = priorRepo;
  await rm(root, { recursive: true, force: true });
});

async function writeSkill(slug: string, description: string | null): Promise<void> {
  const dir = join(skillsRoot, slug);
  await mkdir(dir, { recursive: true });
  const fm = description === null
    ? ""
    : `---\nname: ${slug.split("/").pop()}\ndescription: >-\n  ${description}\n---\n`;
  await writeFile(join(dir, "SKILL.md"), `${fm}# body\n`);
}

async function writeProfile(name: string, body: string): Promise<void> {
  const dir = join(profilesDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "profile.yaml"), body);
}

async function capture<T>(fn: () => Promise<T>): Promise<{ stdout: string; stderr: string; value: T }> {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let out = "", err = "";
  (process.stdout as any).write = (c: string | Uint8Array) => { out += String(c); return true; };
  (process.stderr as any).write = (c: string | Uint8Array) => { err += String(c); return true; };
  try {
    const value = await fn();
    return { stdout: out, stderr: err, value };
  } finally {
    (process.stdout as any).write = origOut;
    (process.stderr as any).write = origErr;
  }
}

describe("cue router <profile>", () => {
  test("renders capability + trigger sections for a profile with a good skill", async () => {
    await writeSkill(
      "demo/good",
      `Use when user says "do the thing" or "run thing". Wraps the thing CLI with house-style defaults.`,
    );
    await writeProfile(
      "demo",
      `name: demo\ndescription: demo profile\nskills:\n  local: [demo/good]\n`,
    );

    const { stdout, value } = await capture(() => routerRun(["demo", "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("demo — skill router preview");
    expect(stdout).toContain("Capabilities");
    expect(stdout).toContain("Wraps the thing CLI");
    expect(stdout).toContain("Trigger phrases");
    expect(stdout).toContain('"do the thing"');
    expect(stdout).toContain("1 skills");
  });

  test("surfaces weak skills in the W6/W7 tail section", async () => {
    await writeSkill("demo/weak", null);
    await writeProfile(
      "demo",
      `name: demo\ndescription: demo profile\nskills:\n  local: [demo/weak]\n`,
    );

    const { stdout, value } = await capture(() => routerRun(["demo", "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("weak metadata");
    expect(stdout).toContain("demo/weak");
  });

  test("errors cleanly when profile doesn't exist", async () => {
    const { stderr, value } = await capture(() => routerRun(["missing", "--no-color"]));
    expect(value).toBe(1);
    expect(stderr).toContain("cue router:");
  });

  test("rejects mixing --audit and a positional", async () => {
    const { stderr, value } = await capture(() => routerRun(["--audit", "demo"]));
    expect(value).toBe(1);
    expect(stderr).toContain("takes no <profile>");
  });

  test("--help prints usage and exits 0", async () => {
    const { stdout, value } = await capture(() => routerRun(["--help"]));
    expect(value).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("cue router <profile>");
  });
});

describe("cue router --graph", () => {
  test("writes a self-contained HTML file with cytoscape elements", async () => {
    await writeSkill(
      "demo/good",
      `Use when user says "do thing" or "run thing". Wraps the thing CLI with house-style defaults.`,
    );
    await writeSkill("demo/weak", null);
    await writeProfile(
      "demo",
      `name: demo\ndescription: demo\nskills:\n  local: [demo/good, demo/weak]\n`,
    );

    const out = join(root, "graph.html");
    const { stdout, value } = await capture(() => routerRun(["--graph", "--out", out, "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("Graph written");
    expect(stdout).toContain(out);

    const { readFile } = await import("node:fs/promises");
    const html = await readFile(out, "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("cytoscape");
    expect(html).toContain('"p:demo"');         // profile node id
    expect(html).toContain('"s:demo/good"');    // skill node id
    expect(html).toContain('"s:demo/weak"');    // weak skill node
    expect(html).toContain('"quality":"good"');
    expect(html).toContain('"quality":"none"');
  });
});

describe("cue router --suggest", () => {
  test("prints rewrite templates for W6/W7 skills", async () => {
    await writeSkill("demo/missing-trigger", "Wraps the missing-trigger tool with sane defaults.");
    await writeProfile(
      "demo",
      `name: demo\ndescription: demo\nskills:\n  local: [demo/missing-trigger]\n`,
    );

    const { stdout, value } = await capture(() => routerRun(["--suggest", "demo", "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("rewrite suggestions");
    expect(stdout).toContain("demo/missing-trigger");
    expect(stdout).toContain("(W6)");
    expect(stdout).toContain("suggested:");
    expect(stdout).toContain("Use when user says");
  });

  test("returns clean message when no skills need cleanup", async () => {
    await writeSkill(
      "demo/perfect",
      `Use when user says "do thing" or "perfect". Wraps the perfect tool with house-style defaults.`,
    );
    await writeProfile(
      "demo",
      `name: demo\ndescription: demo\nskills:\n  local: [demo/perfect]\n`,
    );

    const { stdout, value } = await capture(() => routerRun(["--suggest", "demo", "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("No W6/W7 cleanup needed");
  });

  test("requires a profile arg", async () => {
    const { stderr, value } = await capture(() => routerRun(["--suggest", "--no-color"]));
    expect(value).toBe(1);
    expect(stderr).toContain("expected exactly one <profile>");
  });
});

describe("cue router mode validation", () => {
  test("rejects combining --audit and --graph", async () => {
    const { stderr, value } = await capture(() => routerRun(["--audit", "--graph"]));
    expect(value).toBe(1);
    expect(stderr).toContain("pick one");
  });
});

describe("cue router --audit", () => {
  test("ranks profiles with more weak skills first", async () => {
    await writeSkill(
      "demo/good",
      `Use when user says "good thing". Wraps the good tool with defaults.`,
    );
    await writeSkill("demo/weak", null);
    await writeSkill("demo/another-weak", null);

    await writeProfile(
      "clean",
      `name: clean\ndescription: clean profile\nskills:\n  local: [demo/good]\n`,
    );
    await writeProfile(
      "messy",
      `name: messy\ndescription: messy profile\nskills:\n  local: [demo/weak, demo/another-weak]\n`,
    );

    const { stdout, value } = await capture(() => routerRun(["--audit", "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("skill-router health");
    const messyIdx = stdout.indexOf("messy ");
    const cleanIdx = stdout.indexOf("clean ");
    expect(messyIdx).toBeGreaterThan(-1);
    expect(cleanIdx).toBeGreaterThan(-1);
    // messy must appear before clean — it has more `none`-quality skills.
    expect(messyIdx).toBeLessThan(cleanIdx);
  });

  test("flags high-leverage cleanup targets when a weak skill is in ≥3 profiles", async () => {
    await writeSkill("demo/shared-weak", null);
    for (const name of ["pp", "qq", "rr"]) {
      await writeProfile(
        name,
        `name: ${name}\ndescription: p\nskills:\n  local: [demo/shared-weak]\n`,
      );
    }

    const { stdout, value } = await capture(() => routerRun(["--audit", "--no-color"]));
    expect(value).toBe(0);
    expect(stdout).toContain("High-leverage cleanup");
    expect(stdout).toContain("demo/shared-weak");
    expect(stdout).toContain("used in 3 profiles");
  });
});
