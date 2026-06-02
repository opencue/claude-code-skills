import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { enable } from "./telemetry-consent";
import { recordEvent } from "./analytics";
import { compositeReport, missLeaderboard, topSkills, zombies } from "./telemetry-report";

let tempHome: string;
let priorXDG: string | undefined;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "cue-report-test-"));
  priorXDG = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tempHome;
  enable();
});

afterEach(() => {
  if (priorXDG === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = priorXDG;
  rmSync(tempHome, { recursive: true, force: true });
});

function now(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * 24 * 3600 * 1000).toISOString();
}

describe("topSkills", () => {
  test("ranks skills by invocation count", () => {
    recordEvent({ ts: now(), event: "skill_invoked", skill: "context-save" });
    recordEvent({ ts: now(), event: "skill_invoked", skill: "context-save" });
    recordEvent({ ts: now(), event: "skill_invoked", skill: "caveman" });
    const top = topSkills(30);
    expect(top[0]).toEqual(expect.objectContaining({ skill: "context-save", invocations: 2 }));
    expect(top[1]).toEqual(expect.objectContaining({ skill: "caveman", invocations: 1 }));
  });

  test("respects time window", () => {
    recordEvent({ ts: now(0), event: "skill_invoked", skill: "fresh" });
    recordEvent({ ts: now(60), event: "skill_invoked", skill: "stale" });
    const top = topSkills(30);
    expect(top.find((r) => r.skill === "fresh")).toBeDefined();
    expect(top.find((r) => r.skill === "stale")).toBeUndefined();
  });

  test("limits to N rows", () => {
    for (let i = 0; i < 15; i++) {
      recordEvent({ ts: now(), event: "skill_invoked", skill: `s${i}` });
    }
    expect(topSkills(30, 5).length).toBe(5);
  });
});

describe("zombies", () => {
  test("lists declared skills with 0 invocations", () => {
    recordEvent({ ts: now(), event: "skill_invoked", skill: "context-save" });
    const declared = new Set(["context-save", "never-used-1", "never-used-2"]);
    const result = zombies(declared, 30);
    expect(result.map((z) => z.skill).sort()).toEqual(["never-used-1", "never-used-2"]);
    expect(result.every((z) => z.reason === "never-invoked")).toBe(true);
  });

  test("returns empty when all skills active", () => {
    recordEvent({ ts: now(), event: "skill_invoked", skill: "a" });
    recordEvent({ ts: now(), event: "skill_invoked", skill: "b" });
    expect(zombies(new Set(["a", "b"]), 30)).toEqual([]);
  });
});

describe("missLeaderboard", () => {
  test("aggregates by prompt and ranks by frequency", () => {
    recordEvent({ ts: now(), event: "skill_miss", prompt_redacted: "save progress", matched_skills: ["context-save"] });
    recordEvent({ ts: now(), event: "skill_miss", prompt_redacted: "save progress", matched_skills: ["context-save"] });
    recordEvent({ ts: now(), event: "skill_miss", prompt_redacted: "write commit", matched_skills: ["caveman-commit"] });
    const rows = missLeaderboard(30);
    expect(rows[0]!.promptRedacted).toBe("save progress");
    expect(rows[0]!.count).toBe(2);
    expect(rows[0]!.matchedSkills).toEqual(["context-save"]);
  });
});

describe("compositeReport", () => {
  test("combines top, zombies, and misses with totals", () => {
    recordEvent({ ts: now(), event: "skill_invoked", skill: "alpha" });
    recordEvent({ ts: now(), event: "skill_miss", prompt_redacted: "beta phrase", matched_skills: ["beta"] });
    const declared = new Set(["alpha", "zombie-one"]);
    const r = compositeReport(declared, 30);
    expect(r.totalInvocations).toBe(1);
    expect(r.totalMisses).toBe(1);
    expect(r.top.length).toBe(1);
    expect(r.zombies.map((z) => z.skill)).toEqual(["zombie-one"]);
    expect(r.misses.length).toBe(1);
    expect(r.windowDays).toBe(30);
  });
});
