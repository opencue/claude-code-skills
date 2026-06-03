/**
 * Tests for the MCP catalog + profile-write helpers behind the studio's
 * "Available in cue" section. Catalog reads run against the real on-disk
 * sanitized configs; write tests redirect CUE_PROFILES_DIR to a temp tree so
 * no real `profiles/*.yaml` is ever mutated.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadMcpCatalog, loadAllMcpIds, addMcpToProfile } from "./mcp-catalog";

describe("loadMcpCatalog", () => {
  test("returns the full catalog with inferred transport + install", () => {
    const catalog = loadMcpCatalog();
    expect(catalog.length).toBeGreaterThan(10);

    // ids are unique + sorted
    const ids = catalog.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);

    // every entry has a concrete transport
    for (const e of catalog) {
      expect(["stdio", "sse", "http", "unknown"]).toContain(e.transport);
    }

    // a known stdio server resolves an install command
    const coolify = catalog.find((e) => e.id === "coolify");
    expect(coolify).toBeDefined();
    expect(coolify!.transport).toBe("stdio");
    expect(coolify!.install.length).toBeGreaterThan(0);
  });

  test("catalog ids match the add-validation registry exactly", () => {
    // The UI must never offer an MCP the add path would reject.
    expect(loadMcpCatalog().map((e) => e.id)).toEqual(loadAllMcpIds());
  });
});

describe("addMcpToProfile", () => {
  const created: string[] = [];
  afterEach(async () => {
    delete process.env.CUE_PROFILES_DIR;
    for (const d of created.splice(0)) await rm(d, { recursive: true, force: true });
  });

  async function tempProfiles(yaml: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cue-mcp-test-"));
    created.push(root);
    await mkdir(join(root, "demo"), { recursive: true });
    await writeFile(join(root, "demo", "profile.yaml"), yaml);
    process.env.CUE_PROFILES_DIR = root;
    return root;
  }

  test("rejects an id not in the catalog", async () => {
    await tempProfiles("name: demo\nmcps:\n  - gbrain\n");
    await expect(addMcpToProfile("totally-not-real", "demo")).rejects.toThrow(/unknown-mcp/);
  });

  test("rejects a path-traversal profile name", async () => {
    await tempProfiles("name: demo\n");
    await expect(addMcpToProfile("coolify", "../../etc")).rejects.toThrow(/invalid-profile/);
  });

  test("rejects a composite profile with no profile.yaml", async () => {
    await tempProfiles("name: demo\n");
    await expect(addMcpToProfile("coolify", "core+skill-writer")).rejects.toThrow(
      /invalid-profile|not-a-physical-profile/,
    );
  });

  test("appends a new id into an existing mcps: block", async () => {
    const root = await tempProfiles("name: demo\nmcps:\n  - gbrain\nplugins:\n  - foo\n");
    const res = await addMcpToProfile("coolify", "demo");
    expect(res.alreadyPresent).toBe(false);
    const written = await readFile(join(root, "demo", "profile.yaml"), "utf8");
    expect(written).toContain("- gbrain");
    expect(written).toContain("- coolify");
    // inserted inside the mcps block, above plugins
    expect(written.indexOf("- coolify")).toBeLessThan(written.indexOf("plugins:"));
  });

  test("creates an mcps: block when the profile has none", async () => {
    const root = await tempProfiles("name: demo\nskills:\n  local: []\n");
    await addMcpToProfile("coolify", "demo");
    const written = await readFile(join(root, "demo", "profile.yaml"), "utf8");
    expect(written).toMatch(/mcps:\n\s+- coolify/);
  });

  test("is idempotent when the id is already present", async () => {
    const root = await tempProfiles("name: demo\nmcps:\n  - coolify\n");
    const res = await addMcpToProfile("coolify", "demo");
    expect(res.alreadyPresent).toBe(true);
    const written = await readFile(join(root, "demo", "profile.yaml"), "utf8");
    // not duplicated
    expect(written.match(/- coolify/g)?.length).toBe(1);
  });
});
