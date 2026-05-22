/**
 * Kitty graphics protocol helpers.
 *
 * Kitty's graphics protocol lets us render real images inline in the terminal.
 * Spec: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 *
 * For our use case (small icons in a picker), we use:
 *  - a=T (transmit + display immediately)
 *  - f=100 (PNG format)
 *  - t=f (data is a base64-encoded file path)
 *  - c=N,r=M (display at N columns x M rows)
 *  - q=2 (silent — suppress protocol responses)
 *
 * tmux: if we're running inside tmux, tmux strips terminal-specific escapes
 * by default. We wrap the sequence with tmux's passthrough envelope and the
 * user must have `set -g allow-passthrough on` in ~/.tmux.conf
 * (default in tmux 3.3+, opt-in earlier).
 *
 * Detection: tmux also strips KITTY_* env vars and sets TERM_PROGRAM=tmux,
 * so we additionally walk the process-parent chain to find a `kitty` process.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let kittyAncestorCache: boolean | null = null;

/**
 * Walk /proc/<pid>/stat up the parent chain looking for a Kitty process.
 * Linux-only; on macOS / other OSes returns false (we rely on env vars).
 */
function hasKittyAncestor(): boolean {
  if (kittyAncestorCache !== null) return kittyAncestorCache;
  if (process.platform !== "linux") return (kittyAncestorCache = false);

  let pid: number | null = process.pid;
  for (let depth = 0; depth < 32 && pid && pid > 1; depth++) {
    let comm: string | null = null;
    let ppid: number | null = null;
    try {
      // /proc/<pid>/comm is the truncated process name
      comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    } catch {
      break;
    }
    try {
      // /proc/<pid>/stat: pid (comm) state ppid …
      // comm can contain spaces and parens, so split on the last `)`
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const lastParen = stat.lastIndexOf(")");
      const after = stat.slice(lastParen + 1).trim().split(/\s+/);
      ppid = Number(after[1]);
    } catch {
      break;
    }

    if (comm && /kitty/i.test(comm)) return (kittyAncestorCache = true);
    pid = ppid && ppid > 0 ? ppid : null;
  }
  return (kittyAncestorCache = false);
}

/**
 * Detect whether the current terminal can render Kitty graphics protocol.
 *
 * Detection order (most → least reliable):
 *   1. CUE_KITTY=1 — explicit opt-in (set this in your shell rc when you
 *      always run inside Kitty; bypasses all other detection).
 *   2. CUE_DISABLE_KITTY_IMAGES=1 — explicit opt-out (highest priority).
 *   3. TERM=xterm-kitty (running directly in Kitty, no multiplexer)
 *   4. KITTY_WINDOW_ID set (Kitty exports this for child processes)
 *   5. KITTY_PID, TERM_PROGRAM=kitty, LC_TERMINAL=kitty
 *   6. Inside tmux/screen: walk /proc/<pid>/comm parent chain looking for
 *      a kitty process. Note: tmux server runs detached, so this only works
 *      when the picker is launched as a direct descendant of Kitty (rare
 *      inside tmux). Use CUE_KITTY=1 instead for tmux-inside-Kitty setups.
 */
export function isKittyTerminal(): boolean {
  if (process.env.CUE_DISABLE_KITTY_IMAGES === "1") return false;
  if (process.env.CUE_KITTY === "1") return true;

  // Direct Kitty
  if (process.env.TERM === "xterm-kitty") return true;
  if (process.env.KITTY_WINDOW_ID) return true;
  if (process.env.KITTY_PID) return true;
  if (process.env.TERM_PROGRAM === "kitty") return true;
  if (process.env.LC_TERMINAL === "kitty") return true;

  // tmux/screen typically strips those — fall back to ancestor walk.
  if (process.env.TMUX || /screen/.test(process.env.TERM ?? "")) {
    return hasKittyAncestor();
  }
  return false;
}

/** True iff we're inside a tmux session (need passthrough wrapping). */
function isInsideTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Wrap a single ESC-prefixed sequence with tmux's passthrough envelope so
 * tmux forwards it to the underlying terminal instead of consuming it.
 * Format: ESC P tmux ; <inner with each ESC doubled> ESC \
 * Requires `set -g allow-passthrough on` in tmux config.
 */
function tmuxPassthrough(inner: string): string {
  const escaped = inner.replace(/\x1b/g, "\x1b\x1b");
  return `\x1bPtmux;${escaped}\x1b\\`;
}

/**
 * Build a Kitty graphics-protocol escape sequence that renders `imagePath`
 * inline at `cols` columns wide and `rows` rows tall.
 *
 * The path is base64-encoded per the spec when t=f (file mode).
 * If we're inside tmux, the sequence is wrapped with the passthrough envelope.
 */
export function renderKittyImage(
  imagePath: string,
  cols = 2,
  rows = 1,
  imageId?: number,
): string {
  const abs = resolve(imagePath);
  const b64Path = Buffer.from(abs, "utf8").toString("base64");
  const id = imageId ?? Math.floor(Math.random() * 1_000_000);
  const seq = `\x1b_Ga=T,f=100,t=f,c=${cols},r=${rows},i=${id},q=2;${b64Path}\x1b\\`;
  return isInsideTmux() ? tmuxPassthrough(seq) : seq;
}

/** Test-only: clear the kitty-ancestor cache. */
export function _resetCache(): void {
  kittyAncestorCache = null;
}
