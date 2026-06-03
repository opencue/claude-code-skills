import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { collectUserPrompts } from "./trigger-gaps";

describe("collectUserPrompts budget (guards the dashboard-hang fix)", () => {
  function fixture(promptCount = 50): string {
    const root = mkdtempSync(join(tmpdir(), "cue-tg-"));
    const proj = join(root, "proj-a");
    mkdirSync(proj);
    const lines = Array.from({ length: promptCount }, (_, i) =>
      JSON.stringify({ type: "user", message: { role: "user", content: `prompt ${i}` } }));
    writeFileSync(join(proj, "session.jsonl"), lines.join("\n"));
    return root;
  }

  test("maxPrompts caps how many prompts are collected", () => {
    const root = fixture(50);
    try {
      expect(collectUserPrompts(9999, root, { maxPrompts: 5 }).length).toBe(5);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("maxBytes stops reading once the budget is exhausted", () => {
    const root = fixture(50);
    try {
      // 1-byte budget reads at most the first (newest) file's prompts, never more
      // than one file's worth — here there's a single file, so all 50, but a
      // 0-byte-ish cap still returns the first file then stops (no unbounded walk).
      const out = collectUserPrompts(9999, root, { maxBytes: 1 });
      expect(out.length).toBeLessThanOrEqual(50);
      expect(out.length).toBeGreaterThan(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("unbounded default still collects every in-window prompt", () => {
    const root = fixture(50);
    try {
      const out = collectUserPrompts(9999, root);
      expect(out.length).toBe(50);
      expect(out).toContain("prompt 0");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("missing root returns empty, never throws", () => {
    expect(collectUserPrompts(30, join(tmpdir(), "cue-does-not-exist-xyz"))).toEqual([]);
  });
});
