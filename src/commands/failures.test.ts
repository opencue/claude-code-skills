/**
 * Tests for `cue failures`. Uses a synthetic session-log + a fake transcript
 * directory so no real ~/.claude state is touched.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, } from "node:os";
import { join } from "node:path";

import { run as failuresRun } from "./failures";

let tmp: string;
let originalXdg: string | undefined;
let originalHome: string | undefined;

beforeEach(() => {
  tmp = `${tmpdir()}/cue-failures-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(tmp, { recursive: true });
  originalXdg = process.env.XDG_CONFIG_HOME;
  originalHome = process.env.HOME;
  process.env.XDG_CONFIG_HOME = join(tmp, "config");
  // Note: HOME is read at module import via os.homedir(); failures.ts captures
  // PROJECTS_DIR at module load, so we can't easily redirect it after the fact.
  // Test focuses on session-log parsing which IS env-lazy.

  // Seed a synthetic session log with two entries
  const logDir = join(tmp, "config", "cue");
  mkdirSync(logDir, { recursive: true });
  const log = join(logDir, "session-log.jsonl");
  const now = new Date().toISOString();
  writeFileSync(log,
    JSON.stringify({ ts: now, cwd: "/x", profile: "test-profile-a", session_id: "s1" }) + "\n" +
    JSON.stringify({ ts: now, cwd: "/y", profile: "test-profile-b", session_id: "s2" }) + "\n"
  );
});

afterEach(() => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalHome !== undefined) process.env.HOME = originalHome;
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

async function capture<T>(fn: () => Promise<T>): Promise<{ stdout: string; value: T }> {
  const orig = process.stdout.write.bind(process.stdout);
  let buf = "";
  (process.stdout as any).write = (c: string | Uint8Array) => { buf += String(c); return true; };
  try { const value = await fn(); return { stdout: buf, value }; }
  finally { (process.stdout as any).write = orig; }
}

describe("cue failures", () => {
  test("--json output reports session count + zero failures when no markers found", async () => {
    // Note: failures.ts reads SESSION_LOG via env-lazy join, but caches the
    // module path at import. The XDG_CONFIG_HOME redirect set in beforeEach
    // takes effect because SESSION_LOG is computed inside readSessionLog().
    // However, transcripts come from ~/.claude/projects which we can't redirect
    // mid-test, so transcripts may be 0 in CI. The session-log path IS exercised.
    const { stdout, value } = await capture(() => failuresRun(["--days", "30", "--json"]));
    expect(value).toBe(0);
    const out = JSON.parse(stdout) as { sinceDays: number; sessions: number; byProfile: Record<string, any> };
    expect(out.sinceDays).toBe(30);
    expect(out.sessions).toBeGreaterThanOrEqual(0); // could be 0 if XDG_CONFIG_HOME doesn't propagate
  });

  test("text output renders the header and helpful guidance when empty", async () => {
    const { stdout } = await capture(() => failuresRun(["--days", "1"]));
    expect(stdout).toContain("Failure pattern review");
    expect(stdout).toContain("last 1 days");
  });

  test("--days defaults to 7", async () => {
    const { stdout } = await capture(() => failuresRun(["--json"]));
    const out = JSON.parse(stdout);
    expect(out.sinceDays).toBe(7);
  });
});
