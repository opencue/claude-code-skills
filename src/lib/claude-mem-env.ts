/**
 * claude-mem-env — per-profile claude-mem environment overlay.
 *
 * claude-mem keys its ENTIRE store off CLAUDE_MEM_DATA_DIR (default ~/.claude-mem)
 * and addresses its background worker over a single TCP port (default UID-derived).
 * So out of the box every cue profile shares one memory pool AND one worker port —
 * meaning two concurrent profiles would cross-write through whichever worker
 * claimed the port first. This module gives each profile an isolated, SQLite-only
 * store with its own worker/server ports:
 *
 *   CLAUDE_MEM_DATA_DIR        ~/.claude-mem/profiles/<profile>
 *   CLAUDE_MEM_CHROMA_ENABLED  "false"  → worker runs SQLite-only, never spawns Chroma
 *   CLAUDE_MEM_WORKER_PORT     per-profile (registry-allocated, collision-free)
 *   CLAUDE_MEM_SERVER_PORT     per-profile (registry-allocated)
 *
 * Verified against claude-mem v13.4.0:
 *   - paths.ts:18-40            CLAUDE_MEM_DATA_DIR override + ~/.claude-mem default
 *   - SettingsDefaultsManager   process.env[key] wins over the data-dir settings.json
 *   - worker-service.ts:343-348 CHROMA_ENABLED="false" skips spawning ChromaMcpManager
 *   - worker-service.ts:996     the worker treats the TCP port as a global singleton
 *
 * Pure core (portsForSlot/assignPorts) + injectable I/O so it tests without $HOME.
 * Opt out for a session with CUE_CLAUDE_MEM_ISOLATE=0.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join } from "node:path";

/** A worker+server TCP port pair for one profile. */
export interface PortPair {
  worker: number;
  server: number;
}

/** Persisted slot assignments: profile name → slot index. */
export interface PortRegistry {
  version: number;
  slots: Record<string, number>;
}

/** The four env vars cue injects to isolate a profile's claude-mem store. */
export interface ClaudeMemEnv {
  CLAUDE_MEM_DATA_DIR: string;
  CLAUDE_MEM_CHROMA_ENABLED: string;
  CLAUDE_MEM_WORKER_PORT: string;
  CLAUDE_MEM_SERVER_PORT: string;
}

// Ports sit just below the Linux ephemeral range (32768+) so a profile's worker
// never clashes with an OS-assigned ephemeral port. Two ports per slot:
// worker = even, server = worker + 1 (odd). Slot N → [30000+2N, 30000+2N+1].
const PORT_BASE = 30000;
const MAX_SLOTS = 1000; // 30000..31999

/** Map a slot index to its worker/server port pair. Pure. */
export function portsForSlot(slot: number): PortPair {
  return { worker: PORT_BASE + slot * 2, server: PORT_BASE + slot * 2 + 1 };
}

/**
 * Resolve the slot for `profileName`, assigning the lowest free slot if it is
 * new. Pure: never mutates the input registry; returns a fresh registry when a
 * slot was assigned (so the caller knows to persist).
 */
export function assignPorts(
  registry: PortRegistry,
  profileName: string,
): { registry: PortRegistry; ports: PortPair; assigned: boolean } {
  const existing = registry.slots[profileName];
  if (existing !== undefined) {
    return { registry, ports: portsForSlot(existing), assigned: false };
  }
  const used = new Set(Object.values(registry.slots));
  let slot = 0;
  while (used.has(slot)) slot++;
  if (slot >= MAX_SLOTS) {
    throw new Error(`claude-mem-env: exhausted ${MAX_SLOTS} port slots`);
  }
  const next: PortRegistry = {
    version: registry.version,
    slots: { ...registry.slots, [profileName]: slot },
  };
  return { registry: next, ports: portsForSlot(slot), assigned: true };
}

/** Filesystem-safe per-profile claude-mem data dir under the claude-mem home. */
export function claudeMemDataDir(profileName: string, home: string): string {
  const safe = profileName.replace(/[^A-Za-z0-9._+@-]/g, "_");
  return join(home, ".claude-mem", "profiles", safe);
}

/** Path to the cue-owned port registry inside the claude-mem home. */
export function registryPath(home: string): string {
  return join(home, ".claude-mem", "cue-ports.json");
}

const EMPTY_REGISTRY: PortRegistry = { version: 1, slots: {} };

export interface ResolveDeps {
  /** Home dir (defaults to os.homedir()). */
  home?: string;
  /** Environment to read overrides from (defaults to process.env). */
  existingEnv?: Record<string, string | undefined>;
  /** Whether isolation applies (defaults to CUE_CLAUDE_MEM_ISOLATE !== "0"). */
  isolate?: boolean;
  /** Registry reader (defaults to reading registryPath(home)). */
  readRegistry?: () => PortRegistry;
  /** Registry writer (defaults to an atomic write to registryPath(home)). */
  writeRegistry?: (registry: PortRegistry) => void;
}

/**
 * Compute the env overlay for a profile, or null when isolation must not apply:
 *   - opted out via CUE_CLAUDE_MEM_ISOLATE=0, or
 *   - the user is hand-managing CLAUDE_MEM_DATA_DIR / *_PORT in their own env.
 * In both cases cue leaves claude-mem entirely alone.
 */
export function resolveClaudeMemEnv(
  profileName: string,
  deps: ResolveDeps = {},
): ClaudeMemEnv | null {
  const env = deps.existingEnv ?? process.env;
  const isolate = deps.isolate ?? env.CUE_CLAUDE_MEM_ISOLATE !== "0";
  if (!isolate) return null;
  if (env.CLAUDE_MEM_DATA_DIR || env.CLAUDE_MEM_WORKER_PORT || env.CLAUDE_MEM_SERVER_PORT) {
    return null;
  }

  const home = deps.home ?? osHomedir();
  const readRegistry = deps.readRegistry ?? (() => defaultReadRegistry(home));
  const writeRegistry =
    deps.writeRegistry ?? ((registry: PortRegistry) => defaultWriteRegistry(home, registry));

  const { registry, ports, assigned } = assignPorts(readRegistry(), profileName);
  if (assigned) writeRegistry(registry);

  return {
    CLAUDE_MEM_DATA_DIR: claudeMemDataDir(profileName, home),
    CLAUDE_MEM_CHROMA_ENABLED: "false",
    CLAUDE_MEM_WORKER_PORT: String(ports.worker),
    CLAUDE_MEM_SERVER_PORT: String(ports.server),
  };
}

function defaultReadRegistry(home: string): PortRegistry {
  const path = registryPath(home);
  try {
    if (!existsSync(path)) return { version: 1, slots: {} };
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PortRegistry> | null;
    if (!raw || typeof raw.slots !== "object" || raw.slots === null) {
      return { version: 1, slots: {} };
    }
    return { version: raw.version ?? 1, slots: raw.slots as Record<string, number> };
  } catch {
    // Corrupt or unreadable registry — start fresh rather than block the launch.
    return { version: 1, slots: {} };
  }
}

function defaultWriteRegistry(home: string, registry: PortRegistry): void {
  const path = registryPath(home);
  mkdirSync(join(home, ".claude-mem"), { recursive: true });
  // Write-then-rename so a registry read never sees a torn file. Two never-seen
  // profiles launching in the same instant can still race the read-modify-write;
  // that only mis-assigns on first launch and is fixable via `cue mem ports`.
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`);
  renameSync(tmp, path);
}

export { EMPTY_REGISTRY };
