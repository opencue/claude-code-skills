/**
 * Discover Claude Code plugins installed on this machine, independent of the
 * active cue profile. Reads Claude Code's real plugin store:
 *
 *   <claude-home>/plugins/installed_plugins.json   — the install registry
 *   <claude-home>/settings.json → enabledPlugins   — the on/off map
 *
 * and enriches each entry with its plugin.json description + bundled-skill
 * count when the install path is present on disk.
 *
 * This backs the studio Plugins page's "all installed" view, which is a
 * superset of the profile's declared `plugins:` (that list is a curated
 * subset cue wires into one profile). claude-home defaults to ~/.claude;
 * override with CUE_CLAUDE_HOME for tests or a non-standard install.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DiscoveredPlugin {
  /** "name@marketplace" — the id Claude Code keys plugins by. */
  id: string;
  name: string;
  marketplace: string;
  version: string;
  /** settings.enabledPlugins[id] === true */
  enabled: boolean;
  /** appears anywhere in the enabledPlugins map (known to Claude Code). */
  known: boolean;
  installedAt: string | null;
  installPath: string | null;
  /** From the plugin's .claude-plugin/plugin.json, capped. */
  description: string;
  /** Skills the plugin bundles (SKILL.md count under its install path). */
  skills: number;
}

function claudeHome(): string {
  return process.env.CUE_CLAUDE_HOME ?? join(homedir(), ".claude");
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Skills live at <installPath>/skills/<name>/SKILL.md in the plugin layout. */
function countSkills(installPath: string): number {
  const skillsDir = join(installPath, "skills");
  if (!existsSync(skillsDir)) return 0;
  try {
    return readdirSync(skillsDir, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")),
    ).length;
  } catch {
    return 0;
  }
}

function manifestDescription(installPath: string): string {
  const m = readJson<{ description?: string }>(
    join(installPath, ".claude-plugin", "plugin.json"),
  );
  return (m?.description ?? "").slice(0, 200);
}

interface InstalledEntry {
  version?: string;
  installPath?: string;
  installedAt?: string;
}

/**
 * Enumerate every plugin Claude Code knows about on this machine, enabled or
 * not. Returns enabled-first, then alphabetical. Missing files degrade to an
 * empty list rather than throwing — the dashboard must render even on a fresh
 * machine with no plugins.
 */
export function discoverInstalledPlugins(): DiscoveredPlugin[] {
  const home = claudeHome();
  const installed = readJson<{ plugins: Record<string, InstalledEntry[]> }>(
    join(home, "plugins", "installed_plugins.json"),
  );
  const settings = readJson<{ enabledPlugins?: Record<string, boolean> }>(
    join(home, "settings.json"),
  );
  const enabledMap = settings?.enabledPlugins ?? {};
  const installedMap = installed?.plugins ?? {};

  // Union: a plugin can be installed-but-not-in-the-map, or in the map but
  // its install cache pruned. Show both so nothing silently disappears.
  const ids = new Set<string>([
    ...Object.keys(installedMap),
    ...Object.keys(enabledMap),
  ]);

  const out: DiscoveredPlugin[] = [];
  for (const id of ids) {
    const at = id.lastIndexOf("@");
    const name = at > 0 ? id.slice(0, at) : id;
    const marketplace = at > 0 ? id.slice(at + 1) : "";
    const entry = installedMap[id]?.[0];
    const installPath = entry?.installPath ?? null;
    const onDisk = installPath != null && existsSync(installPath);
    out.push({
      id,
      name,
      marketplace,
      version: entry?.version ?? "unknown",
      enabled: enabledMap[id] === true,
      known: id in enabledMap,
      installedAt: entry?.installedAt ?? null,
      installPath,
      description: onDisk ? manifestDescription(installPath) : "",
      skills: onDisk ? countSkills(installPath) : 0,
    });
  }

  return out.sort(
    (a, b) => Number(b.enabled) - Number(a.enabled) || a.id.localeCompare(b.id),
  );
}
