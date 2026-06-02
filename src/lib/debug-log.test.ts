import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { debug, debugEnabled } from "./debug-log";

const SAVED = process.env.CUE_DEBUG;

// Capture stderr writes without spilling to the test runner's output.
function captureStderr(fn: () => void): string {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = "";
  // @ts-expect-error — narrow override for the test
  process.stderr.write = (chunk: string) => {
    buf += chunk;
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return buf;
}

describe("debug-log", () => {
  beforeEach(() => {
    delete process.env.CUE_DEBUG;
  });
  afterEach(() => {
    if (SAVED === undefined) delete process.env.CUE_DEBUG;
    else process.env.CUE_DEBUG = SAVED;
  });

  test("debugEnabled is false when CUE_DEBUG unset / falsy", () => {
    expect(debugEnabled()).toBe(false);
    process.env.CUE_DEBUG = "";
    expect(debugEnabled()).toBe(false);
    process.env.CUE_DEBUG = "0";
    expect(debugEnabled()).toBe(false);
    process.env.CUE_DEBUG = "false";
    expect(debugEnabled()).toBe(false);
  });

  test("debugEnabled is true for a truthy value", () => {
    process.env.CUE_DEBUG = "1";
    expect(debugEnabled()).toBe(true);
  });

  test("debug() is a silent no-op when disabled", () => {
    const out = captureStderr(() => debug("scope", new Error("boom")));
    expect(out).toBe("");
  });

  test("debug() writes a namespaced line with the error message when enabled", () => {
    process.env.CUE_DEBUG = "1";
    const out = captureStderr(() => debug("launch:autodetect", new Error("boom")));
    expect(out).toContain("[cue:debug]");
    expect(out).toContain("launch:autodetect");
    expect(out).toContain("boom");
  });

  test("debug() handles a missing detail and non-Error values", () => {
    process.env.CUE_DEBUG = "1";
    expect(captureStderr(() => debug("scope"))).toContain("scope");
    expect(captureStderr(() => debug("scope", { a: 1 }))).toContain('{"a":1}');
  });
});
