/**
 * `cue marketplace` — search and install MCPs (via Smithery) and skills (via npx skills find).
 *
 * Subcommands:
 *   search <query>           — search both MCPs and skills
 *   search-mcps <query>      — search MCPs only (Smithery)
 *   search-skills <query>    — search skills only (npx skills find)
 *   install-mcp <id>         — install MCP via Smithery + add to active profile
 *   install-skill <repo>     — install skill via npx skills add + add to active profile
 *   list-mcps                — list connected MCPs (Smithery)
 *   list-tools [connection]  — list tools from connected MCPs
 */

import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

import { resolveProfileForCwd } from "../lib/cwd-resolver";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROFILES_DIR = process.env.CUE_PROFILES_DIR ?? join(REPO_ROOT, "profiles");
const REGISTRY_PATH = join(REPO_ROOT, "docs", "registry", "index.json");
const REGISTRY_URL = "https://recodeee.github.io/cue/registry/index.json";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface RegistrySkill {
  id: string; name: string; description: string;
  repo: string; path: string; tags: string[];
  requires: string[]; profile: string;
}
interface RegistryMcp {
  id: string; name: string; description: string;
  repo: string; install: string; tags: string[];
}
interface Registry {
  version: number; skills: RegistrySkill[]; mcps: RegistryMcp[];
}

function loadRegistry(): Registry | null {
  // Try local first, then fetch remote
  if (existsSync(REGISTRY_PATH)) {
    try { return JSON.parse(readFileSync(REGISTRY_PATH, "utf8")); } catch {}
  }
  // Try fetching remote (sync via spawnSync curl)
  const res = spawnSync("curl", ["-sfL", "--max-time", "5", REGISTRY_URL], { encoding: "utf8" });
  if (res.status === 0 && res.stdout) {
    try { return JSON.parse(res.stdout); } catch {}
  }
  return null;
}

function searchRegistry(query: string, registry: Registry): { skills: RegistrySkill[]; mcps: RegistryMcp[] } {
  const q = query.toLowerCase();
  const skills = registry.skills.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.some(t => t.includes(q)) ||
    s.id.includes(q)
  );
  const mcps = registry.mcps.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.tags.some(t => t.includes(q)) ||
    m.id.includes(q)
  );
  return { skills, mcps };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasSmithery(): boolean {
  const res = spawnSync("smithery", ["--help"], { encoding: "utf8", timeout: 5000 });
  return res.status === 0;
}

function smithery(args: string[], json = false): { ok: boolean; stdout: string; stderr: string } {
  const fullArgs = json ? ["--json", ...args] : args;
  const res = spawnSync("smithery", fullArgs, { encoding: "utf8", timeout: 30000 });
  return { ok: res.status === 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function npxSkills(args: string[]): { ok: boolean; stdout: string } {
  const res = spawnSync("npx", ["skills", ...args], { encoding: "utf8", timeout: 30000 });
  return { ok: res.status === 0, stdout: res.stdout ?? "" };
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function cmdSearchMcps(query: string, json: boolean): Promise<number> {
  if (!hasSmithery()) {
    process.stderr.write("Smithery CLI not installed. Run: npm install -g @smithery/cli\n");
    return 1;
  }

  const res = smithery(["mcp", "search", query], json);
  if (!res.ok) {
    process.stderr.write(`Smithery search failed: ${res.stderr}\n`);
    return 1;
  }
  process.stdout.write(res.stdout);
  if (!json && res.stdout.trim()) {
    process.stdout.write("\nInstall with: cue marketplace install-mcp <id>\n");
  }
  return 0;
}

async function cmdSearchSkills(query: string, json: boolean): Promise<number> {
  // Try smithery skill search first
  if (hasSmithery()) {
    const res = smithery(["skill", "search", query], json);
    if (res.ok && res.stdout.trim()) {
      process.stdout.write(res.stdout);
      if (!json) process.stdout.write("\nInstall with: cue marketplace install-skill <repo>\n");
      return 0;
    }
  }

  // Fallback to npx skills find
  const res = npxSkills(["find", query]);
  if (res.ok && res.stdout.trim()) {
    process.stdout.write(res.stdout);
    if (!json) process.stdout.write("\nInstall with: cue marketplace install-skill <repo>\n");
  } else {
    process.stdout.write(`No skills found for "${query}"\n`);
  }
  return 0;
}

async function cmdSearch(query: string, json: boolean): Promise<number> {
  if (!query) {
    process.stderr.write("Usage: cue marketplace search <query>\n");
    return 1;
  }

  // Search built-in registry first
  const registry = loadRegistry();
  if (registry) {
    const results = searchRegistry(query, registry);
    if (json) {
      process.stdout.write(JSON.stringify(results, null, 2) + "\n");
      return 0;
    }
    if (results.skills.length > 0) {
      process.stdout.write("── Skills ──\n\n");
      for (const s of results.skills) {
        process.stdout.write(`  ${s.name}  (${s.repo})\n`);
        process.stdout.write(`    ${s.description}\n`);
        process.stdout.write(`    tags: ${s.tags.join(", ")}${s.requires.length ? `  requires: ${s.requires.join(", ")}` : ""}\n\n`);
      }
    }
    if (results.mcps.length > 0) {
      process.stdout.write("── MCPs ──\n\n");
      for (const m of results.mcps) {
        process.stdout.write(`  ${m.name}  (${m.install})\n`);
        process.stdout.write(`    ${m.description}\n`);
        process.stdout.write(`    tags: ${m.tags.join(", ")}\n\n`);
      }
    }
    if (results.skills.length === 0 && results.mcps.length === 0) {
      process.stdout.write(`No results for "${query}" in the registry.\n`);
    } else {
      process.stdout.write(`Install with: cue marketplace install-skill <repo>\n`);
    }
    return 0;
  }

  // Fallback to Smithery + npx
  if (!json) process.stdout.write(`🔍 Searching MCPs and skills for "${query}"...\n\n`);
  if (!json) process.stdout.write("── MCPs (Smithery) ──\n\n");
  await cmdSearchMcps(query, json);
  if (!json) process.stdout.write("\n── Skills ──\n\n");
  await cmdSearchSkills(query, json);
  return 0;
}

async function cmdInstallMcp(id: string): Promise<number> {
  if (!hasSmithery()) {
    process.stderr.write("Smithery CLI not installed. Run: npm install -g @smithery/cli\n");
    return 1;
  }

  process.stdout.write(`Installing MCP "${id}" via Smithery...\n`);

  // Install to Claude Code via Smithery
  const res = smithery(["mcp", "add", id, "--client", "claude"]);
  if (!res.ok) {
    // Try without --client flag (remote connection)
    const res2 = smithery(["mcp", "add", id]);
    if (!res2.ok) {
      process.stderr.write(`Failed to install: ${res.stderr || res2.stderr}\n`);
      return 1;
    }
    process.stdout.write(res2.stdout);
  } else {
    process.stdout.write(res.stdout);
  }

  // Add to active profile
  let profileName: string | null = null;
  try { profileName = await resolveProfileForCwd(process.cwd()); } catch { /* no profile */ }

  if (profileName) {
    const { readFile, writeFile } = await import("node:fs/promises");
    const yamlPath = join(PROFILES_DIR, profileName, "profile.yaml");
    try {
      let content = await readFile(yamlPath, "utf8");
      if (!content.includes(`- ${id}`)) {
        if (content.includes("mcps:")) {
          const lines = content.split("\n");
          const mcpsIdx = lines.findIndex(l => l.match(/^mcps:/));
          let insertIdx = mcpsIdx + 1;
          while (insertIdx < lines.length && lines[insertIdx]?.match(/^\s+-\s/)) insertIdx++;
          lines.splice(insertIdx, 0, `  - ${id}`);
          content = lines.join("\n");
        } else {
          content = content.trimEnd() + `\nmcps:\n  - ${id}\n`;
        }
        await writeFile(yamlPath, content);
        process.stdout.write(`✅ Added "${id}" to profile "${profileName}"\n`);
      }
    } catch { /* skip profile update */ }
  }

  process.stdout.write(`\n⚠️  Restart Claude Code to connect the new MCP.\n`);
  return 0;
}

async function cmdInstallSkill(repo: string): Promise<number> {
  // Try smithery first
  if (hasSmithery()) {
    process.stdout.write(`Installing skill "${repo}" via Smithery...\n`);
    const res = smithery(["skill", "add", repo, "--agent", "claude-code"]);
    if (res.ok) {
      process.stdout.write(res.stdout);
      process.stdout.write(`✅ Skill installed.\n`);
      return 0;
    }
  }

  // Fallback to npx skills add
  process.stdout.write(`Installing skill "${repo}" via npx skills...\n`);
  const res = spawnSync("npx", ["skills", "add", repo, "-a", "claude-code", "-y"], {
    stdio: "inherit",
    encoding: "utf8",
  });

  if (res.status !== 0) {
    process.stderr.write(`Failed to install skill.\n`);
    return 1;
  }

  process.stdout.write(`✅ Skill installed.\n`);
  return 0;
}

async function cmdListMcps(json: boolean): Promise<number> {
  if (!hasSmithery()) {
    process.stderr.write("Smithery CLI not installed. Run: npm install -g @smithery/cli\n");
    return 1;
  }
  const res = smithery(["mcp", "list"], json);
  process.stdout.write(res.stdout);
  return res.ok ? 0 : 1;
}

async function cmdListTools(connection: string, json: boolean): Promise<number> {
  if (!hasSmithery()) {
    process.stderr.write("Smithery CLI not installed. Run: npm install -g @smithery/cli\n");
    return 1;
  }
  const args = connection ? ["tool", "list", connection] : ["tool", "list"];
  const res = smithery(args, json);
  process.stdout.write(res.stdout);
  return res.ok ? 0 : 1;
}

async function cmdFindTools(query: string, json: boolean): Promise<number> {
  if (!hasSmithery()) {
    process.stderr.write("Smithery CLI not installed. Run: npm install -g @smithery/cli\n");
    return 1;
  }
  const res = smithery(["tool", "find", query], json);
  process.stdout.write(res.stdout);
  return res.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function cmdDiscover(profileFilter: string, json: boolean): Promise<number> {
  const profile = profileFilter || (await resolveProfileForCwd(process.cwd()).catch(() => null));

  process.stderr.write("🔍 Discovering popular skills on GitHub...\n\n");

  // Search GitHub for claude-code skills repos with high stars
  const searches = [
    "claude-code skill SKILL.md",
    "claude skill agent",
    "claude-code-skills",
  ];

  const seen = new Set<string>();
  const results: { repo: string; stars: number; description: string }[] = [];

  for (const q of searches) {
    const res = spawnSync("gh", [
      "search", "repos", q,
      "--sort", "stars", "--limit", "10",
      "--json", "fullName,stargazersCount,description",
    ], { encoding: "utf8", timeout: 15000 });

    if (res.status !== 0) continue;
    try {
      const repos = JSON.parse(res.stdout) as { fullName: string; stargazersCount: number; description: string }[];
      for (const r of repos) {
        if (seen.has(r.fullName)) continue;
        if (r.stargazersCount < 50) continue;
        seen.add(r.fullName);
        results.push({ repo: r.fullName, stars: r.stargazersCount, description: r.description ?? "" });
      }
    } catch { /* skip */ }
  }

  results.sort((a, b) => b.stars - a.stars);
  const top = results.slice(0, 15);

  if (json) {
    process.stdout.write(JSON.stringify(top, null, 2) + "\n");
    return 0;
  }

  // Check which ones we already have
  const { loadProfile, listProfiles } = await import("../lib/profile-loader");
  const allProfiles = await listProfiles();
  const allNpxRepos = new Set<string>();
  for (const name of allProfiles) {
    try {
      const p = await loadProfile(name);
      for (const n of p.skills.npx) allNpxRepos.add((n as any).source?.repo ?? "");
    } catch {}
  }

  process.stdout.write("  ⭐  Repository                              Description\n");
  process.stdout.write("  ──  ────────────────────────────────────────  ───────────\n");

  for (const r of top) {
    const installed = allNpxRepos.has(r.repo) ? " ✓" : "  ";
    const stars = String(r.stars).padStart(5);
    const name = r.repo.padEnd(40);
    const desc = r.description.slice(0, 60);
    process.stdout.write(`${installed} ${stars}  ${name}  ${desc}\n`);
  }

  process.stdout.write(`\n  Install: cue marketplace install-skill <repo>\n`);
  process.stdout.write(`  Example: cue marketplace install-skill AgriciDaniel/claude-ads\n\n`);
  return 0;
}

export async function run(args: string[]): Promise<number> {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(`cue marketplace — search and install MCPs + skills

Usage: cue marketplace <subcommand> [args]

Subcommands:
  search <query>         Search MCPs (Smithery) + skills
  search-mcps <query>    Search MCPs only
  search-skills <query>  Search skills only
  discover [profile]     Find popular GitHub skills not yet in your profiles
  install-mcp <id>       Install MCP via Smithery
  install-skill <repo>   Install skill from GitHub
  list-mcps              List connected Smithery MCPs
  list-tools [conn]      List tools from connected MCPs
  find-tools <query>     Search tools by intent

Examples:
  cue marketplace search "github"
  cue marketplace install-mcp exa
  cue marketplace search-skills "kubernetes"
`);
    return 0;
  }

  const sub = args[0] ?? "search";
  const json = args.includes("--json");
  const rest = args.filter(a => a !== "--json");

  switch (sub) {
    case "search":
      return cmdSearch(rest.slice(1).join(" ") || "", json);
    case "search-mcps":
      return cmdSearchMcps(rest.slice(1).join(" ") || "", json);
    case "search-skills":
      return cmdSearchSkills(rest.slice(1).join(" ") || "", json);
    case "install-mcp":
      return cmdInstallMcp(rest[1] ?? "");
    case "install-skill":
      return cmdInstallSkill(rest[1] ?? "");
    case "list-mcps":
      return cmdListMcps(json);
    case "list-tools":
      return cmdListTools(rest[1] ?? "", json);
    case "find-tools":
      return cmdFindTools(rest.slice(1).join(" ") || "", json);
    case "discover":
      return cmdDiscover(rest[1] ?? "", json);
    default:
      // If no subcommand matches, treat as search query
      return cmdSearch(rest.join(" "), json);
  }
}
