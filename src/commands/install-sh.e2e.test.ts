/**
 * Smoke test for install.sh — proves the shell install path that every new
 * user depends on: it symlinks `cue` onto PATH, writes a working `claude`
 * shim, and `cue --version` runs through the shim dir.
 *
 * Hermetic: installs into a throwaway SHIM_DIR with a stub `authmux` on PATH so
 * install.sh's Step 5 never runs `npm install -g authmux` (no network).
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
// CI-only: install.sh does `cd CUE_DIR && bun install`, which would mutate the
// developer's real node_modules and may hit the network on a cold cache. CI
// runs on a fresh checkout where that's fine and is the canonical place to
// prove the shell install path; locally we skip to keep the working tree clean.
const CAN_RUN =
  !!process.env.CI &&
  process.platform !== "win32" &&
  spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!CAN_RUN)("install.sh smoke", () => {
  let shimDir: string;
  beforeEach(() => {
    shimDir = mkdtempSync(join(tmpdir(), "cue-installsh-"));
    // Stub authmux so `command -v authmux` short-circuits Step 5 (no npm -g).
    const stub = join(shimDir, "authmux");
    writeFileSync(stub, "#!/usr/bin/env bash\necho 0.0.0\n");
    chmodSync(stub, 0o755);
  });
  afterEach(() => rmSync(shimDir, { recursive: true, force: true }));

  test("symlinks cue, writes a working claude shim, and cue --version runs through it", () => {
    const env = {
      ...process.env,
      SHIM_DIR: shimDir,
      CUE_DIR: REPO_ROOT,
      PATH: `${shimDir}:${process.env.PATH ?? ""}`,
    };
    const res = spawnSync("bash", [join(REPO_ROOT, "install.sh"), "--yes"], {
      encoding: "utf8",
      timeout: 120000,
      env,
    });
    expect(res.status).toBe(0);

    // cue is exposed on PATH (symlink to bin/cue).
    expect(existsSync(join(shimDir, "cue"))).toBe(true);

    // claude shim routes through cue.
    const claudeShim = join(shimDir, "claude");
    expect(existsSync(claudeShim)).toBe(true);
    expect(readFileSync(claudeShim, "utf8")).toContain("exec cue launch claude");

    // `cue --version` works through the installed symlink and matches package.json.
    const pkgVersion = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
    const ver = spawnSync(join(shimDir, "cue"), ["--version"], { encoding: "utf8", env, timeout: 20000 });
    expect(ver.status).toBe(0);
    expect(ver.stdout.trim()).toBe(pkgVersion);
    expect(ver.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
