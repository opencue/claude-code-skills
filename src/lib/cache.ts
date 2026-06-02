/**
 * Shared cache helpers for resolver modules (currently only resolver-npx).
 *
 * The on-disk layout is contract-bound (see profiles/_cache/README.md):
 *
 *   <repoRoot>/profiles/_cache/npx/<key>/<skill-name>/SKILL.md
 *
 * Callers compute `<key>` (sha256 of repo + pin) and hand it to:
 *   - cachePath(key)        -> absolute dir path (may or may not exist)
 *   - cacheHit(key)         -> true iff a non-empty cache dir exists
 *   - cachePut(key, srcDir) -> atomic-ish move of an already-prepared
 *                              directory into the cache slot
 *   - cacheEvict(layout)    -> prune LRU entries beyond MAX_CACHE_ENTRIES
 *
 * The cache root is injected so tests can use tmpdir() instead of touching
 * the real profiles/_cache/ tree.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cacheDir } from "./config-paths";

export interface CacheLayout {
  /**
   * Absolute dir that holds the `npx/` cache subtree. When omitted, the cache
   * lives in the XDG cache dir (`~/.cache/cue`) so a globally-installed cue
   * never writes inside its own install directory.
   */
  cacheRoot?: string;
  /**
   * @deprecated Legacy injection point. If set (and `cacheRoot` is not), the
   * cache lives at `<repoRoot>/profiles/_cache/npx/` to preserve the old
   * dev-tree layout. Tests use this; production passes neither.
   */
  repoRoot?: string;
}

const NPX_SUBDIR = "npx";

/** Absolute path to the `npx/` cache root for a given layout. */
function npxRoot(layout: CacheLayout): string {
  if (layout.cacheRoot) return resolve(layout.cacheRoot, NPX_SUBDIR);
  if (layout.repoRoot) return resolve(layout.repoRoot, "profiles", "_cache", NPX_SUBDIR);
  return join(cacheDir(), NPX_SUBDIR);
}

/** Maximum number of cache entries before LRU eviction kicks in. */
export const MAX_CACHE_ENTRIES = 20;

/**
 * Resolve the absolute cache dir for a given key. Does NOT create it.
 *
 * `key` must be a hex sha256 — callers compute it via crypto.createHash so
 * we keep cache.ts hash-agnostic and reusable for non-npx caches later.
 */
export function cachePath(layout: CacheLayout, key: string): string {
  if (!key || key.includes("/") || key.includes("..")) {
    throw new Error(`cache: invalid key ${JSON.stringify(key)}`);
  }
  return join(npxRoot(layout), key);
}

/**
 * True iff the cache dir for `key` exists AND contains at least one entry.
 * An empty dir is treated as a miss — half-populated caches are corruption,
 * not hits.
 */
export function cacheHit(layout: CacheLayout, key: string): boolean {
  const dir = cachePath(layout, key);
  if (!existsSync(dir)) return false;
  try {
    const st = statSync(dir);
    if (!st.isDirectory()) return false;
    const entries = readdirSync(dir);
    if (entries.length === 0) return false;
    // Touch atime to mark as recently used (LRU tracking).
    try { utimesSync(dir, new Date(), st.mtime); } catch {}
    return true;
  } catch {
    return false;
  }
}

/**
 * Move an already-prepared directory at `srcDir` into the cache slot for
 * `key`. If the slot already exists, it's replaced. Cross-device safe in
 * the common case (same FS) — we rely on rename within the repo tree.
 *
 * Callers should populate `srcDir` in a temp directory first, then call
 * cachePut to publish atomically. Never write directly into cachePath().
 */
export function cachePut(layout: CacheLayout, key: string, srcDir: string): string {
  if (!existsSync(srcDir)) {
    throw new Error(`cache: source dir does not exist: ${srcDir}`);
  }
  const dest = cachePath(layout, key);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  renameSync(srcDir, dest);
  // Evict oldest entries if over budget.
  cacheEvict(layout);
  return dest;
}

/**
 * Internal helper: list children of a cache slot. Used by resolver-npx to
 * detect partial / corrupt caches without re-implementing path math.
 */
export function cacheChildren(layout: CacheLayout, key: string): string[] {
  const dir = cachePath(layout, key);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Convenience: full path to a single skill inside a cache slot. */
export function cacheSkillPath(layout: CacheLayout, key: string, skill: string): string {
  return join(cachePath(layout, key), skill);
}

/**
 * LRU eviction: remove the least-recently-accessed entries when the cache
 * exceeds MAX_CACHE_ENTRIES. Uses directory atime (updated on cacheHit).
 * Non-fatal — eviction errors are silently ignored.
 */
export function cacheEvict(layout: CacheLayout, maxEntries = MAX_CACHE_ENTRIES): number {
  const cacheRoot = npxRoot(layout);
  if (!existsSync(cacheRoot)) return 0;

  let entries: { name: string; atime: number }[];
  try {
    entries = readdirSync(cacheRoot)
      .map((name) => {
        try {
          const st = statSync(join(cacheRoot, name));
          return st.isDirectory() ? { name, atime: st.atimeMs } : null;
        } catch { return null; }
      })
      .filter((e): e is { name: string; atime: number } => e !== null);
  } catch { return 0; }

  if (entries.length <= maxEntries) return 0;

  // Sort by atime ascending (oldest first), remove excess.
  entries.sort((a, b) => a.atime - b.atime);
  const toRemove = entries.slice(0, entries.length - maxEntries);
  let removed = 0;
  for (const entry of toRemove) {
    try {
      rmSync(join(cacheRoot, entry.name), { recursive: true, force: true });
      removed++;
    } catch {}
  }
  return removed;
}
