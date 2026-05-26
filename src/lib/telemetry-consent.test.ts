import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  analyticsPath,
  consentPath,
  disable,
  enable,
  isEnabled,
  purge,
  seenTrackerPath,
  statusSummary,
} from "./telemetry-consent";
import { recordEvent } from "./analytics";

let tempHome: string;
let priorXDG: string | undefined;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "cue-telemetry-test-"));
  priorXDG = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tempHome;
});

afterEach(() => {
  if (priorXDG === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = priorXDG;
  rmSync(tempHome, { recursive: true, force: true });
});

describe("telemetry-consent", () => {
  test("isEnabled() is false by default", () => {
    expect(isEnabled()).toBe(false);
  });

  test("enable() creates the consent record and flips isEnabled()", () => {
    const result = enable();
    expect(result.alreadyEnabled).toBe(false);
    expect(result.wipedLegacyBytes).toBe(0);
    expect(isEnabled()).toBe(true);
    const record = JSON.parse(readFileSync(consentPath(), "utf8").split("\n")[0] ?? "{}");
    expect(record.version).toBe(1);
    expect(typeof record.enabled_at).toBe("string");
  });

  test("enable() wipes pre-existing legacy analytics.jsonl", () => {
    // Simulate older cue version writing silently.
    mkdirSync(join(tempHome, "cue"), { recursive: true });
    writeFileSync(analyticsPath(), '{"ts":"2026-01-01","event":"start","profile":"x"}\n');
    expect(existsSync(analyticsPath())).toBe(true);

    const result = enable();
    expect(result.wipedLegacyBytes).toBeGreaterThan(0);
    expect(existsSync(analyticsPath())).toBe(false);
    expect(isEnabled()).toBe(true);
  });

  test("enable() called twice is a no-op the second time", () => {
    enable();
    const second = enable();
    expect(second.alreadyEnabled).toBe(true);
    expect(second.wipedLegacyBytes).toBe(0);
  });

  test("disable() removes the consent flag without wiping events", () => {
    enable();
    recordEvent({ ts: "2026-01-01T00:00:00Z", event: "start", profile: "x", agent: "claude-code", cwd: "/tmp" });
    expect(existsSync(analyticsPath())).toBe(true);

    const result = disable();
    expect(result.wasEnabled).toBe(true);
    expect(isEnabled()).toBe(false);
    expect(existsSync(analyticsPath())).toBe(true);
  });

  test("disable() on already-disabled is a no-op", () => {
    const result = disable();
    expect(result.wasEnabled).toBe(false);
  });

  test("recordEvent() is a no-op when telemetry is disabled", () => {
    // Telemetry disabled — recordEvent must not write.
    recordEvent({ ts: "2026-01-01T00:00:00Z", event: "start", profile: "x", agent: "claude-code", cwd: "/tmp" });
    expect(existsSync(analyticsPath())).toBe(false);
  });

  test("recordEvent() writes when telemetry is enabled", () => {
    enable();
    recordEvent({ ts: "2026-01-01T00:00:00Z", event: "start", profile: "x", agent: "claude-code", cwd: "/tmp" });
    expect(existsSync(analyticsPath())).toBe(true);
    const content = readFileSync(analyticsPath(), "utf8");
    expect(content).toContain('"event":"start"');
  });

  test("recordEvent() accepts new event types (skill_invoked, skill_miss)", () => {
    enable();
    recordEvent({
      ts: "2026-01-01T00:00:00Z",
      event: "skill_invoked",
      skill: "context-save",
      session_id: "sess-1",
      tool_use_id: "tool-1",
    });
    recordEvent({
      ts: "2026-01-01T00:01:00Z",
      event: "skill_miss",
      session_id: "sess-1",
      prompt_redacted: "save progress",
      matched_skills: ["context-save"],
    });
    const lines = readFileSync(analyticsPath(), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).event).toBe("skill_invoked");
    expect(JSON.parse(lines[1]!).event).toBe("skill_miss");
  });

  test("purge() wipes events + seen tracker, leaves consent intact", () => {
    enable();
    recordEvent({ ts: "2026-01-01T00:00:00Z", event: "start", profile: "x", agent: "claude-code", cwd: "/tmp" });
    writeFileSync(seenTrackerPath(), '{"seen":["sess-1|tool-1"]}\n');

    const result = purge();
    expect(result.removedAnalyticsBytes).toBeGreaterThan(0);
    expect(result.removedSeenTrackerBytes).toBeGreaterThan(0);
    expect(existsSync(analyticsPath())).toBe(false);
    expect(existsSync(seenTrackerPath())).toBe(false);
    expect(isEnabled()).toBe(true);
  });

  test("statusSummary() reports disabled + legacy data when applicable", () => {
    mkdirSync(join(tempHome, "cue"), { recursive: true });
    writeFileSync(analyticsPath(), '{"ts":"2026-01-01","event":"start","profile":"x"}\n');
    const status = statusSummary();
    expect(status.enabled).toBe(false);
    expect(status.hasLegacyData).toBe(true);
    expect(status.legacyDataBytes).toBeGreaterThan(0);
  });

  test("statusSummary() reports enabled + event window", () => {
    enable();
    recordEvent({ ts: "2026-01-01T00:00:00Z", event: "start", profile: "x", agent: "claude-code", cwd: "/tmp" });
    recordEvent({ ts: "2026-01-02T00:00:00Z", event: "end", profile: "x", agent: "claude-code", cwd: "/tmp", duration_s: 60 });
    const status = statusSummary();
    expect(status.enabled).toBe(true);
    expect(status.eventCount).toBe(2);
    expect(status.oldestEventTs).toBe("2026-01-01T00:00:00Z");
    expect(status.newestEventTs).toBe("2026-01-02T00:00:00Z");
    expect(status.hasLegacyData).toBe(false);
  });
});
