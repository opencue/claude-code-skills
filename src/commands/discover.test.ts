/**
 * Tests for `cue discover` export modes. Writes a synthetic gems cache, runs
 * the command against a tmp dir, and asserts on the file shape. No network.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir, } from "node:os";
import { join } from "node:path";

import { run as discoverRun } from "./discover";

let tmp: string;
let originalXdg: string | undefined;

beforeEach(() => {
  tmp = `${tmpdir()}/cue-discover-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(tmp, { recursive: true });
  // Redirect XDG_CONFIG_HOME so the cache lives in tmp and we don't trample the user's real cache.
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = join(tmp, "config");

  // Seed a synthetic gem cache the export command will consume.
  const cacheDir = join(tmp, "config", "cue", "discover");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "gems.json"), JSON.stringify({
    updated: "2026-05-24T00:00:00.000Z",
    gems: [
      {
        full_name: "octocat/alpha", owner: "octocat", name: "alpha",
        description: "Alpha skill for backend devs.", stars: 12, forks: 1,
        created_at: "2026-01-01", pushed_at: "2026-05-01",
        topics: ["claude-skill"], language: "TypeScript",
        has_skill_md: true, has_claude_dir: false, has_mcp_sdk: false,
        gem_score: 9, suggested_profiles: ["backend"], suggested_mcps: [], suggested_clis: ["node"],
        quality: 8, url: "https://github.com/octocat/alpha",
      },
      {
        full_name: "octocat/beta", owner: "octocat", name: "beta",
        description: "Beta skill for marketing folks.", stars: 4, forks: 0,
        created_at: "2026-02-01", pushed_at: "2026-05-10",
        topics: [], language: "JavaScript",
        has_skill_md: true, has_claude_dir: false, has_mcp_sdk: false,
        gem_score: 6, suggested_profiles: ["marketing", "backend"], suggested_mcps: [], suggested_clis: [],
        quality: 5, url: "https://github.com/octocat/beta",
      },
    ],
  }, null, 2));
});

afterEach(() => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

// Silence stdout in tests
function silent<T>(fn: () => Promise<T>): Promise<T> {
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = () => true;
  return fn().finally(() => { (process.stdout as any).write = orig; });
}

describe("cue discover --export (legacy single-file)", () => {
  test("writes a single markdown file with both gems grouped by profile", async () => {
    const out = join(tmp, "out.md");
    await silent(() => discoverRun(["--export", out]));
    expect(existsSync(out)).toBe(true);
    const content = readFileSync(out, "utf8");
    expect(content).toMatch(/# 🎯 Discovered Skills/);
    expect(content).toContain("octocat/alpha");
    expect(content).toContain("octocat/beta");
    expect(content).toMatch(/^##\s.*backend/m);
    expect(content).toMatch(/^##\s.*marketing/m);
  });
});

describe("cue discover --export --site (per-profile pages)", () => {
  test("emits index + per-profile pages with frontmatter", async () => {
    const dir = join(tmp, "site");
    await silent(() => discoverRun(["--export", dir, "--site"]));

    expect(existsSync(join(dir, "index.md"))).toBe(true);
    expect(existsSync(join(dir, "backend.md"))).toBe(true);
    expect(existsSync(join(dir, "marketing.md"))).toBe(true);

    const indexMd = readFileSync(join(dir, "index.md"), "utf8");
    expect(indexMd).toMatch(/^---\n/);                    // frontmatter
    expect(indexMd).toMatch(/title: "Discovered/);
    expect(indexMd).toContain("[**backend**](./backend.md)");
    expect(indexMd).toContain("[**marketing**](./marketing.md)");

    const backendMd = readFileSync(join(dir, "backend.md"), "utf8");
    expect(backendMd).toMatch(/title: "Claude Code Skills for backend"/);
    expect(backendMd).toContain("octocat/alpha");
    expect(backendMd).toContain("octocat/beta");           // beta also fits backend
    expect(backendMd).toContain("cue skills add octocat/alpha --profile backend");
    expect(backendMd).toMatch(/<a id="octocat-alpha"><\/a>/);  // stable per-repo anchor
  });

  test("--site --html also emits .html files with JSON-LD schema", async () => {
    const dir = join(tmp, "site-html");
    await silent(() => discoverRun(["--export", dir, "--site", "--html"]));

    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "backend.html"))).toBe(true);

    const indexHtml = readFileSync(join(dir, "index.html"), "utf8");
    expect(indexHtml).toContain('application/ld+json');
    expect(indexHtml).toContain('"@type": "ItemList"');
    expect(indexHtml).toContain('"@type": "SoftwareApplication"');
    expect(indexHtml).toContain('"name": "octocat/alpha"');
    expect(indexHtml).toContain('property="og:title"');     // social meta
    expect(indexHtml).toContain('rel="canonical"');         // SEO canonical

    const backendHtml = readFileSync(join(dir, "backend.html"), "utf8");
    expect(backendHtml).toContain('Claude Code Skills for backend');
    expect(backendHtml).toContain('id="octocat-alpha"');    // anchor for deep-links
  });

  test("total file count matches: 1 index + N profiles (× 2 if html)", async () => {
    const dir = join(tmp, "site-count");
    await silent(() => discoverRun(["--export", dir, "--site", "--html"]));
    const files = readdirSync(dir);
    // 1 (index) + 2 (backend, marketing) = 3, times 2 for html = 6
    expect(files.filter((f) => f.endsWith(".md")).length).toBe(3);
    expect(files.filter((f) => f.endsWith(".html")).length).toBe(3);
  });
});

describe("cue discover --export with missing cache", () => {
  test("exits 1 with helpful error", async () => {
    rmSync(join(tmp, "config", "cue", "discover", "gems.json"));
    const origErr = process.stderr.write.bind(process.stderr);
    let stderr = "";
    (process.stderr as any).write = (c: string | Uint8Array) => { stderr += String(c); return true; };
    try {
      const code = await silent(() => discoverRun(["--export", join(tmp, "out.md")]));
      expect(code).toBe(1);
      expect(stderr).toContain("No cached gems");
    } finally {
      (process.stderr as any).write = origErr;
    }
  });
});
