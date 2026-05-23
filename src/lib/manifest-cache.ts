/**
 * Profile manifest cache — skip YAML parsing + inheritance resolution on repeat launches.
 *
 * Stores the fully-resolved profile as JSON alongside the mtime of each source
 * profile.yaml in the inheritance chain. On next load, if all mtimes match,
 * we return the cached result directly (< 1ms vs ~15ms for full resolution).
 *
 * Cache location: ~/.config/cue/cache/manifests/<profile>.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { ResolvedProfile } from "../../profiles/_types";

const CACHE_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "cue",
  "cache",
  "manifests",
);

interface ManifestEntry {
  /** Resolved profile data. */
  profile: ResolvedProfile;
  /** Map of source file path → mtime (ms). */
  sources: Record<string, number>;
  /** Cache format version. */
  version: 1;
}

/**
 * Try to load a cached manifest for a profile.
 * Returns null if cache miss or stale.
 */
export function getCachedManifest(
  profileName: string,
  profilesDir: string,
): ResolvedProfile | null {
  const cachePath = join(CACHE_DIR, `${profileName}.json`);
  if (!existsSync(cachePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as ManifestEntry;
    if (raw.version !== 1) return null;

    // Validate all source mtimes still match
    for (const [path, expectedMtime] of Object.entries(raw.sources)) {
      try {
        const st = statSync(path);
        if (st.mtimeMs !== expectedMtime) return null;
      } catch {
        return null; // file removed
      }
    }

    return raw.profile;
  } catch {
    return null;
  }
}

/**
 * Store a resolved profile in the manifest cache.
 */
export function putCachedManifest(
  profile: ResolvedProfile,
  profilesDir: string,
): void {
  // Collect source file mtimes from the inheritance chain
  const sources: Record<string, number> = {};

  // The profile itself
  const selfYaml = join(profilesDir, profile.name, "profile.yaml");
  if (existsSync(selfYaml)) {
    sources[selfYaml] = statSync(selfYaml).mtimeMs;
  }

  // Inherited profiles (if the chain is available)
  if ((profile as any).inheritanceChain) {
    for (const ancestor of (profile as any).inheritanceChain) {
      if (ancestor === profile.name) continue;
      const p = join(profilesDir, ancestor, "profile.yaml");
      if (existsSync(p)) {
        sources[p] = statSync(p).mtimeMs;
      }
    }
  }

  const entry: ManifestEntry = { profile, sources, version: 1 };

  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, `${profile.name}.json`), JSON.stringify(entry));
  } catch { /* non-fatal — cache write failure is fine */ }
}
