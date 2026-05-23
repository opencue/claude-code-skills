/**
 * Runtime lock — prevent concurrent materializations of the same profile.
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface LockResult {
  acquired: boolean;
  holder?: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(runtimeDir: string): LockResult {
  const lockPath = join(runtimeDir, ".active-pid");
  mkdirSync(dirname(lockPath), { recursive: true });

  // Check existing lock
  if (existsSync(lockPath)) {
    try {
      const pid = parseInt(readFileSync(lockPath, "utf8").trim(), 10);
      if (pid && isProcessAlive(pid)) {
        return { acquired: false, holder: pid };
      }
      // Stale lock — remove
      unlinkSync(lockPath);
    } catch { /* corrupt lock file — remove */ }
  }

  // Acquire
  writeFileSync(lockPath, String(process.pid));
  return { acquired: true };
}

export function releaseLock(runtimeDir: string): void {
  const lockPath = join(runtimeDir, ".active-pid");
  try {
    const content = readFileSync(lockPath, "utf8").trim();
    if (parseInt(content, 10) === process.pid) {
      unlinkSync(lockPath);
    }
  } catch { /* already gone */ }
}

export function checkLock(runtimeDir: string): { locked: boolean; pid?: number } {
  const lockPath = join(runtimeDir, ".active-pid");
  if (!existsSync(lockPath)) return { locked: false };
  try {
    const pid = parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    if (pid && isProcessAlive(pid)) return { locked: true, pid };
    // Stale
    unlinkSync(lockPath);
    return { locked: false };
  } catch {
    return { locked: false };
  }
}
