import { describe, expect, test } from "bun:test";

import { __test, startLoader } from "./launch-loader";

const { createLoaderCore, FRAMES, ESC } = __test;

/** A CoreDeps stub that records every write into a single string. */
function makeRecorder(opts: { logo?: string | null; clear?: string; logoCols?: number } = {}) {
  let out = "";
  const deps = {
    write: (s: string) => {
      out += s;
    },
    renderLogo: () => (opts.logo === undefined ? null : opts.logo),
    clearLogo: () => opts.clear ?? "",
    logoCols: opts.logoCols ?? 2,
  };
  return { deps, get: () => out };
}

describe("launch-loader core — ANSI path (no logo)", () => {
  test("start hides cursor and draws the first frame at column 1", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "Launching Claude…");
    core.start();
    const out = r.get();
    expect(out).toContain(ESC.HIDE_CURSOR);
    expect(out).toContain("\x1b[1G\x1b[K"); // text column 1, erase to EOL
    expect(out).toContain(FRAMES[0]!);
    expect(out).toContain("Launching Claude…");
  });

  test("tick advances to the next frame", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "msg");
    core.start();
    core.tick();
    expect(r.get()).toContain(FRAMES[1]!);
  });

  test("stop erases the line and shows the cursor, with no Kitty clear", () => {
    const r = makeRecorder(); // clear defaults to ""
    const core = createLoaderCore(r.deps, "msg");
    core.start();
    core.stop();
    const out = r.get();
    expect(out).toContain(ESC.ERASE_LINE);
    expect(out.endsWith(ESC.SHOW_CURSOR)).toBe(true);
    // delete-by-id APC must not appear when there is no logo
    expect(out).not.toContain("\x1b_Ga=d");
  });

  test("setMessage redraws with the new text", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "old");
    core.start();
    core.setMessage("new message");
    expect(r.get()).toContain("new message");
  });
});

describe("launch-loader core — Kitty path (logo present)", () => {
  test("start renders the logo once and offsets the text after it", () => {
    const r = makeRecorder({ logo: "<IMG>", clear: "<CLR>", logoCols: 2 });
    const core = createLoaderCore(r.deps, "m");
    core.start();
    const out = r.get();
    expect(out).toContain("<IMG>");
    // logoCols(2) + 2 = column 4
    expect(out).toContain("\x1b[4G\x1b[K");
  });

  test("stop deletes the logo before showing the cursor", () => {
    const r = makeRecorder({ logo: "<IMG>", clear: "<CLR>" });
    const core = createLoaderCore(r.deps, "m");
    core.start();
    core.stop();
    const out = r.get();
    const clearIdx = out.indexOf("<CLR>");
    const showIdx = out.lastIndexOf(ESC.SHOW_CURSOR);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(showIdx).toBeGreaterThan(clearIdx);
  });
});

describe("launch-loader core — lifecycle guards", () => {
  test("stop without start writes nothing (warm-launch no-op)", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "m");
    core.stop();
    expect(r.get()).toBe("");
    expect(core.started).toBe(false);
  });

  test("stop is idempotent", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "m");
    core.start();
    core.stop();
    const afterFirst = r.get();
    core.stop();
    expect(r.get()).toBe(afterFirst);
  });

  test("start after stop is a no-op", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "m");
    core.stop();
    core.start();
    expect(core.started).toBe(false);
    expect(r.get()).toBe("");
  });

  test("tick before start does nothing", () => {
    const r = makeRecorder();
    const core = createLoaderCore(r.deps, "m");
    core.tick();
    expect(r.get()).toBe("");
  });
});

describe("startLoader — non-interactive returns null", () => {
  test("returns null and writes nothing when the stream is not a TTY", () => {
    let wrote = "";
    const fakeStream = {
      isTTY: false,
      write: (s: string) => {
        wrote += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    const handle = startLoader({ stream: fakeStream, startDelayMs: 0 });
    expect(handle).toBeNull();
    expect(wrote).toBe("");
  });
});
