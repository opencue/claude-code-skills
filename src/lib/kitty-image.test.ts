import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { isKittyTerminal, renderKittyImage, _resetCache } from "./kitty-image";

const SAVED_ENV = { ...process.env };
function clearKittyEnv() {
  delete process.env.TERM;
  delete process.env.KITTY_WINDOW_ID;
  delete process.env.KITTY_PID;
  delete process.env.TMUX;
  delete process.env.TERM_PROGRAM;
  delete process.env.LC_TERMINAL;
  delete process.env.CUE_DISABLE_KITTY_IMAGES;
  _resetCache();
}

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, SAVED_ENV);
});

describe("isKittyTerminal", () => {
  beforeEach(() => clearKittyEnv());

  test("true when TERM=xterm-kitty", () => {
    process.env.TERM = "xterm-kitty";
    expect(isKittyTerminal()).toBe(true);
  });

  test("true when KITTY_WINDOW_ID is set", () => {
    process.env.KITTY_WINDOW_ID = "1";
    expect(isKittyTerminal()).toBe(true);
  });

  test("false on a plain xterm with no Kitty hints", () => {
    process.env.TERM = "xterm-256color";
    expect(isKittyTerminal()).toBe(false);
  });

  test("inside tmux + KITTY_PID → true (Kitty under tmux)", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
    process.env.TERM = "tmux-256color";
    process.env.KITTY_PID = "9999";
    expect(isKittyTerminal()).toBe(true);
  });

  test("inside tmux + TERM_PROGRAM=kitty → true", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
    process.env.TERM = "tmux-256color";
    process.env.TERM_PROGRAM = "kitty";
    expect(isKittyTerminal()).toBe(true);
  });

  test("inside tmux with no Kitty hints → false", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
    process.env.TERM = "tmux-256color";
    expect(isKittyTerminal()).toBe(false);
  });

  test("CUE_DISABLE_KITTY_IMAGES=1 forces false even in Kitty", () => {
    process.env.TERM = "xterm-kitty";
    process.env.CUE_DISABLE_KITTY_IMAGES = "1";
    expect(isKittyTerminal()).toBe(false);
  });

  test("CUE_KITTY=1 forces true even with no Kitty hints", () => {
    // No TERM, no KITTY_*, no TMUX hints — would normally be false.
    process.env.CUE_KITTY = "1";
    expect(isKittyTerminal()).toBe(true);
  });

  test("CUE_DISABLE_KITTY_IMAGES wins over CUE_KITTY", () => {
    process.env.CUE_KITTY = "1";
    process.env.CUE_DISABLE_KITTY_IMAGES = "1";
    expect(isKittyTerminal()).toBe(false);
  });
});

describe("renderKittyImage", () => {
  beforeEach(() => clearKittyEnv());

  test("emits raw Kitty escape outside tmux", () => {
    const seq = renderKittyImage("/tmp/foo.png", 2, 1, 42);
    expect(seq.startsWith("\x1b_G")).toBe(true);
    expect(seq.endsWith("\x1b\\")).toBe(true);
    expect(seq).toContain("c=2,r=1");
    expect(seq).toContain("i=42");
  });

  test("inside tmux, wraps with passthrough envelope and doubles ESCs", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
    const seq = renderKittyImage("/tmp/foo.png", 2, 1, 42);
    expect(seq.startsWith("\x1bPtmux;")).toBe(true);
    expect(seq.endsWith("\x1b\\")).toBe(true);
    // Inner ESCs should be doubled — there are 2 ESCs in the original sequence
    // (one at start, one at end), each becomes \x1b\x1b in the wrapped form.
    const innerEscapes = (seq.match(/\x1b\x1b/g) ?? []).length;
    expect(innerEscapes).toBeGreaterThanOrEqual(2);
  });

  test("file path is base64-encoded in the sequence", () => {
    const seq = renderKittyImage("/path/to/img.png", 2, 1, 1);
    const b64 = Buffer.from("/path/to/img.png", "utf8").toString("base64");
    expect(seq).toContain(b64);
  });
});
