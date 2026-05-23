import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  isKittyTerminal,
  kittyPlaceholderLabel,
  renderKittyImage,
  transmitKittyImage,
  _resetCache,
} from "./kitty-image";

const SAVED_ENV = { ...process.env };
function clearKittyEnv() {
  delete process.env.TERM;
  delete process.env.KITTY_WINDOW_ID;
  delete process.env.KITTY_PID;
  delete process.env.TMUX;
  delete process.env.TERM_PROGRAM;
  delete process.env.LC_TERMINAL;
  delete process.env.CUE_KITTY;
  delete process.env.CUE_DISABLE_KITTY_IMAGES;
  // Override ancestor walk to return false — tests control detection via env vars only
  _resetCache(() => false);
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


describe("kittyPlaceholderLabel", () => {
  test("encodes image ID via 256-color FG escape", () => {
    const label = kittyPlaceholderLabel(42, 2, 1);
    expect(label.startsWith("\x1b[38;5;42m")).toBe(true);
    expect(label.endsWith("\x1b[39m")).toBe(true);
  });

  test("emits one U+10EEEE per cell with row+col diacritics", () => {
    const label = kittyPlaceholderLabel(7, 2, 1);
    // 2 cols × 1 row = 2 placeholder chars
    const placeholderCount = [...label].filter((ch) => ch === "\u{10EEEE}").length;
    expect(placeholderCount).toBe(2);
    // Both share row 0 (U+0305); columns 0 (U+0305) and 1 (U+030D)
    expect(label).toContain("\u{10EEEE}\u{0305}\u{0305}");
    expect(label).toContain("\u{10EEEE}\u{0305}\u{030D}");
  });

  test("placeholder cells count as one display cell each, FG escape strips to zero", async () => {
    // Verify the layout-engine sees the label as exactly `cols × rows` wide.
    const stringWidth = (await import("fast-string-width")).default;
    const label = kittyPlaceholderLabel(1, 2, 1);
    expect(stringWidth(label)).toBe(2);
    const wide = kittyPlaceholderLabel(1, 4, 1);
    expect(stringWidth(wide)).toBe(4);
  });

  test("rejects out-of-range image IDs", () => {
    expect(() => kittyPlaceholderLabel(0)).toThrow(/imageId/);
    expect(() => kittyPlaceholderLabel(256)).toThrow(/imageId/);
    expect(() => kittyPlaceholderLabel(-1)).toThrow(/imageId/);
    expect(() => kittyPlaceholderLabel(1.5)).toThrow(/imageId/);
  });

  test("rejects rows/cols beyond the diacritic table", () => {
    expect(() => kittyPlaceholderLabel(1, 33, 1)).toThrow(/diacritic/);
    expect(() => kittyPlaceholderLabel(1, 1, 33)).toThrow(/diacritic/);
  });

  test("rejects non-positive dimensions", () => {
    expect(() => kittyPlaceholderLabel(1, 0, 1)).toThrow(/>= 1/);
    expect(() => kittyPlaceholderLabel(1, 1, 0)).toThrow(/>= 1/);
  });
});

describe("transmitKittyImage", () => {
  let writes: string[] = [];
  let originalIsTTY: boolean | undefined;
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    clearKittyEnv();
    writes = [];
    originalIsTTY = process.stdout.isTTY;
    originalWrite = process.stdout.write.bind(process.stdout);
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    process.stdout.write = ((chunk: unknown) => {
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  test("writes a=T,U=1 sequence with image id, dimensions, and base64 path", () => {
    transmitKittyImage("/tmp/icon.png", 99, 2, 1);
    expect(writes).toHaveLength(1);
    const seq = writes[0]!;
    expect(seq.startsWith("\x1b_G")).toBe(true);
    expect(seq.endsWith("\x1b\\")).toBe(true);
    expect(seq).toContain("a=T");
    expect(seq).toContain("U=1");
    expect(seq).toContain("i=99");
    expect(seq).toContain("c=2,r=1");
    const b64 = Buffer.from("/tmp/icon.png", "utf8").toString("base64");
    expect(seq).toContain(b64);
  });

  test("wraps with tmux passthrough envelope when inside tmux", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,1234,0";
    try {
      transmitKittyImage("/tmp/icon.png", 5);
      expect(writes[0]!.startsWith("\x1bPtmux;")).toBe(true);
    } finally {
      delete process.env.TMUX;
    }
  });

  test("no-op when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    transmitKittyImage("/tmp/icon.png", 1);
    expect(writes).toHaveLength(0);
  });
});
