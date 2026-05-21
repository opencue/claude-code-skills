/**
 * Tests for schema delta: top-level plugins + per-resource agents override.
 *
 * Run with: `bun test bin/cli/lib/profile-loader.schema-delta.test.ts`
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadProfile } from "./profile-loader";

let scratchRoot: string;
let priorEnv: string | undefined;

beforeEach(async () => {
  scratchRoot = await mkdtemp(join(tmpdir(), "cue-schema-"));
  priorEnv = process.env.SOUL_PROFILES_DIR;
});

afterEach(() => {
  if (priorEnv === undefined) {
    delete process.env.SOUL_PROFILES_DIR;
  } else {
    process.env.SOUL_PROFILES_DIR = priorEnv;
  }
});

async function fixture(yaml: string): Promise<string> {
  await mkdir(join(scratchRoot, "frontend"), { recursive: true });
  await writeFile(join(scratchRoot, "frontend", "profile.yaml"), yaml);
  process.env.SOUL_PROFILES_DIR = scratchRoot;
  return scratchRoot;
}

describe("schema delta", () => {
  test("accepts top-level plugins with marketplace qualifier", async () => {
    await fixture(`
name: frontend
description: Frontend work
plugins:
  - frontend-design@claude-plugins-official
  - superpowers@claude-plugins-official
`);
    const p = await loadProfile("frontend");
    // NOTE: Resolved form normalizes strings to objects { id }.
    expect(p.plugins).toEqual([
      { id: "frontend-design@claude-plugins-official" },
      { id: "superpowers@claude-plugins-official" },
    ]);
  });

  test("rejects top-level plugins entry without @marketplace", async () => {
    await fixture(`
name: frontend
description: Frontend work
plugins:
  - frontend-design
`);
    expect(loadProfile("frontend")).rejects.toThrow(/marketplace/i);
  });

  test("accepts per-resource agents override (object form)", async () => {
    await fixture(`
name: frontend
description: Frontend work
mcps:
  - id: medusadocs
    agents: [claude-code]
  - claude-mem
`);
    const p = await loadProfile("frontend");
    expect(p.mcps).toEqual([
      { id: "medusadocs", agents: ["claude-code"] },
      { id: "claude-mem" },
    ]);
  });

  test("normalizes plain-string mcps to object form internally", async () => {
    await fixture(`
name: frontend
description: Frontend work
mcps:
  - claude-mem
`);
    const p = await loadProfile("frontend");
    expect(p.mcps[0]).toEqual({ id: "claude-mem" });
  });
});
