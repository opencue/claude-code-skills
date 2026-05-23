/**
 * `cue quick [message]` — one-shot launch with zero skills/MCPs.
 *
 * Fastest possible cold start. No profile resolution, no materialization.
 * Just launches the real claude binary directly with an optional initial message.
 *
 * Usage:
 *   cue quick                     # launch bare claude
 *   cue quick "fix the typo"     # launch with initial prompt
 *   cue quick -p "summarize"     # pass -p flag through
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

async function findRealClaude(): Promise<string | null> {
  const shimDir = resolve(homedir(), ".local", "bin");
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(":")) {
    if (resolve(dir) === shimDir) continue;
    const candidate = resolve(dir, "claude");
    try {
      const { stat } = await import("node:fs/promises");
      const st = await stat(candidate);
      if (st.isFile() && (st.mode & 0o111) !== 0) return candidate;
    } catch { /* not here */ }
  }
  return null;
}

export async function run(args: string[]): Promise<number> {
  const realBin = await findRealClaude();
  if (!realBin) {
    process.stderr.write("cue quick: couldn't find the real 'claude' binary on PATH\n");
    return 127;
  }

  // Pass all args through to claude (e.g. -p "message", --model, etc.)
  const childArgs = args.length ? args : [];

  process.stderr.write("⚡ cue quick — launching bare claude (no profile)\n");

  return new Promise((res) => {
    const child = spawn(realBin, childArgs, {
      stdio: "inherit",
      env: { ...process.env, CUE_LAUNCHING: "1" },
    });
    child.on("exit", (code) => res(code ?? 0));
    child.on("error", () => res(127));
  });
}
