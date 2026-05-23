/**
 * `cue status` — single-glance overview of the current cue state.
 *
 * Combines: active profile, usage stats, and doctor warnings.
 */

import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveProfileForCwd } from "../lib/cwd-resolver";
import { loadProfile, listProfiles } from "../lib/profile-loader";
import { computeStats } from "../lib/analytics";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS_ROOT = join(REPO_ROOT, "resources", "skills", "skills");
const MCP_CONFIGS_DIR = join(REPO_ROOT, "resources", "mcps", "configs");
const RUNTIME_ROOT = join(process.env.HOME ?? "~", ".config", "cue", "runtime");

function configDir(): string {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "cue")
    : join(homedir(), ".config", "cue");
}

interface Warning {
  code: string;
  message: string;
}

function quickDiagnose(profileName: string, profile: any): Warning[] {
  const warnings: Warning[] = [];

  // Check skills exist on disk
  for (const s of profile.skills.local) {
    const id = s.id ?? s;
    // Try to find the skill in any category
    let found = false;
    try {
      const cats = readdirSync(SKILLS_ROOT, { withFileTypes: true });
      for (const cat of cats) {
        if (!cat.isDirectory()) continue;
        const skillDir = join(SKILLS_ROOT, cat.name, id);
        if (existsSync(join(skillDir, "SKILL.md"))) { found = true; break; }
      }
    } catch { /* skip */ }
    if (!found && typeof id === "string" && !id.includes("/")) {
      // Could be a category/slug ref — check directly
      if (existsSync(join(SKILLS_ROOT, id, "SKILL.md"))) found = true;
    }
    if (!found) {
      warnings.push({ code: "D1", message: `skill "${id}" not found on disk` });
    }
  }

  // Check MCPs exist in registry
  const mcpIds = new Set<string>();
  for (const file of ["claude.sanitized.json", "claude_runtime.sanitized.json", "codex.sanitized.json"]) {
    try {
      const raw = JSON.parse(readFileSync(join(MCP_CONFIGS_DIR, file), "utf8"));
      if (raw.servers) for (const id of Object.keys(raw.servers)) mcpIds.add(id);
    } catch { /* skip */ }
  }
  for (const m of profile.mcps) {
    const id = m.id ?? m;
    if (!mcpIds.has(id)) {
      warnings.push({ code: "D2", message: `MCP "${id}" not in registry` });
    }
  }

  // D4: Skill → MCP dependency check
  try {
    const { detectMissingDependencies } = require("../lib/skill-dependencies");
    const skillIds = profile.skills.local.map((s: any) => s.id ?? s);
    const profileMcpIds = profile.mcps.map((m: any) => m.id ?? m);
    const missing = detectMissingDependencies(profileName, skillIds, profileMcpIds);
    for (const m of missing) {
      warnings.push({ code: "D4", message: `skill "${m.skillId}" needs MCP "${m.mcpId}" (${m.source})` });
    }
  } catch { /* non-fatal */ }

  // Check runtime staleness
  const runtimeDir = join(RUNTIME_ROOT, profileName);
  if (existsSync(runtimeDir)) {
    const hashFile = join(runtimeDir, ".hash");
    if (!existsSync(hashFile)) {
      warnings.push({ code: "D5", message: "runtime missing hash (may be stale)" });
    }
  }

  return warnings;
}

export async function run(args: string[]): Promise<number> {
  const json = args.includes("--json");

  // 1. Active profile
  const resolved = await resolveProfileForCwd({
    cwd: process.cwd(),
    homeDir: homedir(),
    configDir: configDir(),
  });

  const hasProfile = resolved.source !== "none";
  let profile: any = null;
  let warnings: Warning[] = [];

  if (hasProfile) {
    try {
      profile = await loadProfile(resolved.profile);
      warnings = quickDiagnose(resolved.profile, profile);
    } catch (e) {
      warnings.push({ code: "D0", message: `cannot load profile: ${e}` });
    }
  }

  // 2. Stats
  const stats = computeStats();
  const totalSessions = stats.reduce((a, s) => a + s.sessions, 0);

  // 3. Profiles count
  const allProfiles = await listProfiles();

  if (json) {
    const out = {
      profile: hasProfile ? resolved.profile : null,
      source: resolved.source,
      skills: profile ? profile.skills.local.length + profile.skills.npx.length : 0,
      mcps: profile ? profile.mcps.length : 0,
      plugins: profile ? profile.plugins.length : 0,
      totalProfiles: allProfiles.length,
      totalSessions,
      warnings,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return 0;
  }

  // Human output
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

  process.stdout.write("\n");

  // Profile section
  if (hasProfile) {
    process.stdout.write(`  ${bold("Profile")}  ${green(resolved.profile)} ${dim(`(${resolved.source})`)}\n`);
    if (profile) {
      const skillCount = profile.skills.local.length + profile.skills.npx.length;
      process.stdout.write(`  ${bold("Skills")}   ${skillCount}    ${bold("MCPs")} ${profile.mcps.length}    ${bold("Plugins")} ${profile.plugins.length}\n`);
    }
  } else {
    process.stdout.write(`  ${bold("Profile")}  ${dim("none pinned for this directory")}\n`);
  }

  process.stdout.write("\n");

  // Stats section
  process.stdout.write(`  ${bold("Profiles")} ${allProfiles.length}    ${bold("Sessions")} ${totalSessions}\n`);
  if (stats.length > 0) {
    const top = stats.slice(0, 3);
    const topStr = top.map(s => `${s.profile}(${s.sessions})`).join(", ");
    process.stdout.write(`  ${bold("Top")}      ${topStr}\n`);
  }

  // Warnings section
  if (warnings.length > 0) {
    process.stdout.write("\n");
    process.stdout.write(`  ${yellow("⚠")} ${bold("Warnings")} (${warnings.length})\n`);
    for (const w of warnings.slice(0, 5)) {
      process.stdout.write(`    ${yellow(w.code)} ${w.message}\n`);
    }
    if (warnings.length > 5) {
      process.stdout.write(`    ${dim(`…and ${warnings.length - 5} more (run cue doctor for details)`)}\n`);
    }
  } else if (hasProfile) {
    process.stdout.write(`\n  ${green("✓")} ${dim("no issues detected")}\n`);
  }

  process.stdout.write("\n");
  return 0;
}
