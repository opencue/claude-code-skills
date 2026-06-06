/**
 * `cue summon [profile]` — bind a profile into the LIVE session, no cold restart.
 *
 * When you open a directory with no `.cue-profile`, the right profile's skills
 * and MCPs normally need a pin + a full `claude` restart (CLAUDE_CONFIG_DIR, the
 * Skill() list, MCP servers, and /slash commands are frozen at boot). `summon`
 * is the two-tier bridge:
 *
 *   Tier A (now, zero restart): resolve a profile, list its skills as
 *     readable SKILL.md paths + a persona, so the running agent can soft-load
 *     them inline (the `meta/profile-summon` skill drives this — same mechanism
 *     as `meta/smart-loader`, just whole-profile).
 *   Tier B (durable + full fidelity): write the `.cue-profile` pin so the next
 *     launch is correct, and hand back the warm re-exec (`claude --continue`)
 *     that resumes THIS conversation under the fully-materialized profile —
 *     the only honest way to get the MCP servers + /slash commands the soft
 *     load can't fake.
 *
 * This command never spawns an agent and never fakes MCP tools. Its only side
 * effect is writing the pin (skippable with `--no-pin`).
 *
 * Flags:
 *   [profile]        force this profile (else auto-detect from cwd)
 *   --json           machine-readable output (consumed by meta/profile-summon)
 *   --no-pin         don't write .cue-profile
 *   --pick           list detected candidates and exit (no pin, no apply)
 *   --active <name>  override active-session profile detection (for mcp_status)
 *   --dry-run        compute everything, write nothing
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { loadProfile, listProfiles } from "../lib/profile-loader";
import { resolveLocalSkill } from "../lib/resolver-local";
import { detectProfileV2 } from "../lib/auto-detect";
import { getSkillDependencies } from "../lib/skill-dependencies";

/** Minimum auto-detect confidence to summon without an explicit arg. Mirrors
 * SUGGESTED_MIN_CONFIDENCE in launch.ts so the picker and summon agree. */
export const SUMMON_MIN_CONFIDENCE = 0.5;

/** The warm re-exec that resumes this conversation under the full profile. */
export const REEXEC_CMD = "claude --continue";

export interface SummonOptions {
  cwd: string;
  /** Explicit target profile; when null, auto-detect from cwd. */
  profile?: string | null;
  /** Override active-session profile detection (for mcp_status). */
  active?: string | null;
  noPin?: boolean;
  dryRun?: boolean;
}

export interface SummonSkill {
  id: string;
  /** Absolute SKILL.md path to Read, or "" when it can't be resolved on disk. */
  path: string;
  /** "ok" (soft-loadable now) or "missing:<mcp1,mcp2>" (needs the harness). */
  mcp_status: string;
}

export interface SummonResult {
  profile: string;
  /** Profile persona prose to apply inline ("" when none declared). */
  persona: string;
  /** true when the profile was auto-detected (no explicit arg). */
  detected: boolean;
  confidence?: number;
  reasons?: string[];
  /** Active running-session profile selector, or null when undetectable. */
  active_profile: string | null;
  pin_written: boolean;
  pin_path: string;
  /** Existing `.cue-profile` content before this summon, or null when none.
   * Lets the consumer flag a re-pin over a *different* profile instead of a
   * silent clobber, and skip a redundant write when it already matches. */
  pin_previous: string | null;
  /** Local skills — soft-loadable inline (read each `path`). */
  skills: SummonSkill[];
  /** npx skills — loaded at launch only, can't be soft-loaded as prose. */
  npx_skills: string[];
  /** Profile MCPs and whether they're already loaded in the active session. */
  mcps: { id: string; loaded: boolean }[];
  /** /slash commands the profile adds (need the harness). */
  commands: string[];
  plugins: string[];
  reexec_cmd: string;
}

/**
 * Detect the profile of the *currently running* session (not the cwd's pin).
 * Mirrors `resolve_active_profile` in smart-lookup.sh: env first, then the
 * CLAUDE_CONFIG_DIR runtime path. Returns a selector like "core+skill-writer".
 */
export function detectActiveProfile(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.CUE_ACTIVE_PROFILE || env.CUE_PROFILE;
  if (fromEnv) return fromEnv;
  const ccd = env.CLAUDE_CONFIG_DIR;
  if (ccd) {
    const m = ccd.match(/\/cue\/runtime\/(.+?)\/claude\/?$/);
    if (m) return m[1]!;
  }
  return null;
}

/** Union of MCP ids (lowercased) loaded by an active profile selector. */
async function loadActiveMcpIds(selector: string | null): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!selector) return ids;
  for (const part of selector.split("+").map((s) => s.trim()).filter(Boolean)) {
    try {
      const p = await loadProfile(part);
      for (const m of p.mcps) ids.add(m.id.toLowerCase());
    } catch {
      // Unknown/stale part — skip; conservative (its MCPs count as not loaded).
    }
  }
  return ids;
}

/** "ok" when every MCP a skill needs is loaded in the active session, else the
 * missing list. Skills with no MCP deps are always "ok" (pure-prose soft-load). */
function skillMcpStatus(skillId: string, activeMcps: Set<string>): string {
  const deps = getSkillDependencies(skillId);
  if (deps.length === 0) return "ok";
  const missing = [
    ...new Set(deps.map((d) => d.mcpId).filter((m) => !activeMcps.has(m.toLowerCase()))),
  ];
  return missing.length === 0 ? "ok" : `missing:${missing.join(",")}`;
}

/**
 * Resolve which profile to summon: explicit arg (must exist) or the top
 * auto-detection above the confidence floor. Throws a user-facing Error when
 * nothing resolves.
 */
async function resolveTarget(
  explicit: string | null | undefined,
  cwd: string,
): Promise<{ profile: string; detected: boolean; confidence?: number; reasons?: string[] }> {
  const known = new Set(await listProfiles());
  if (explicit) {
    if (!known.has(explicit)) {
      throw new Error(`unknown profile "${explicit}" — run \`cue list\` to see profiles`);
    }
    return { profile: explicit, detected: false };
  }
  const dets = detectProfileV2(cwd).filter((d) => known.has(d.profile));
  const top = dets[0];
  if (!top || top.confidence < SUMMON_MIN_CONFIDENCE) {
    throw new Error(
      "no profile confidently matches this directory — pass one explicitly: `cue summon <profile>`",
    );
  }
  return { profile: top.profile, detected: true, confidence: top.confidence, reasons: top.reasons };
}

/**
 * Pure core: resolve, enumerate, (optionally) pin. No printing, no agent spawn.
 * Exported for tests and for the `meta/profile-summon` skill via `--json`.
 */
export async function summon(opts: SummonOptions): Promise<SummonResult> {
  const target = await resolveTarget(opts.profile, opts.cwd);
  const profile = await loadProfile(target.profile);

  // `undefined` (omitted) → auto-detect the running session; explicit `null` →
  // treat as no active session (every MCP-gated skill counts as not loaded).
  const active = opts.active === undefined ? detectActiveProfile() : opts.active;
  const activeMcps = await loadActiveMcpIds(active);

  const skills: SummonSkill[] = [];
  for (const s of profile.skills.local) {
    let path = "";
    try {
      path = join(await resolveLocalSkill(s.id), "SKILL.md");
    } catch {
      // Skill id doesn't resolve on disk — still report it; the consumer can
      // fall through to smart-loader's filesystem scan.
    }
    skills.push({ id: s.id, path, mcp_status: skillMcpStatus(s.id, activeMcps) });
  }

  const pinPath = join(opts.cwd, ".cue-profile");
  const pinPrevious = existsSync(pinPath) ? readFileSync(pinPath, "utf8").trim() || null : null;
  let pinWritten = false;
  // Skip the write when it's already pinned to this profile (no-op, respects
  // the skill's pinned-noop contract); otherwise write — a re-pin over a
  // DIFFERENT profile is surfaced via `pin_previous`, never silently clobbered.
  if (!opts.noPin && !opts.dryRun && pinPrevious !== profile.name) {
    writeFileSync(pinPath, `${profile.name}\n`);
    pinWritten = true;
  }

  return {
    profile: profile.name,
    persona: profile.persona ?? "",
    detected: target.detected,
    confidence: target.confidence,
    reasons: target.reasons,
    active_profile: active,
    pin_written: pinWritten,
    pin_path: pinPath,
    pin_previous: pinPrevious,
    skills,
    npx_skills: profile.skills.npx.flatMap((n) => n.skills),
    mcps: profile.mcps.map((m) => ({ id: m.id, loaded: activeMcps.has(m.id.toLowerCase()) })),
    commands: profile.commands.map((c) => `/${basename(c, ".md")}`),
    plugins: profile.plugins.map((p) => p.id),
    reexec_cmd: REEXEC_CMD,
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

const HELP = `cue summon — bind a profile into the LIVE session, no cold restart

Usage: cue summon [profile] [flags]

Resolves a profile (explicit arg, else auto-detected from this directory),
lists its skills as readable SKILL.md paths so the running agent can soft-load
them inline, pins .cue-profile, and prints the warm re-exec (\`${REEXEC_CMD}\`)
that resumes this conversation under the full profile (MCPs + /slash commands).

Flags:
  --json           machine-readable output (for meta/profile-summon)
  --no-pin         don't write .cue-profile
  --pick           list detected candidates and exit (no pin)
  --active <name>  override active-session profile (affects mcp_status)
  --dry-run        compute everything, write nothing
  -h, --help       show this help

Examples:
  cue summon vercel          # summon a known profile here
  cue summon                 # auto-detect from cwd
  cue summon --json | jq     # drive from the meta/profile-summon skill
`;

function printHuman(r: SummonResult): void {
  const out: string[] = [];
  const det = r.detected ? ` (auto-detected, ${Math.round((r.confidence ?? 0) * 100)}% match)` : "";
  out.push(`🔮 summon ${r.profile}${det}`);
  if (r.detected && r.reasons?.length) out.push(`   why: ${r.reasons.slice(0, 3).join(", ")}`);
  out.push("");

  const loadable = r.skills.filter((s) => s.mcp_status === "ok");
  const gated = r.skills.filter((s) => s.mcp_status !== "ok");
  out.push(`✅ soft-load now (no restart): persona${r.persona ? "" : " (none)"} + ${loadable.length} skill${loadable.length === 1 ? "" : "s"}`);
  for (const s of loadable.slice(0, 8)) out.push(`   • ${s.id}`);
  if (loadable.length > 8) out.push(`   …and ${loadable.length - 8} more`);

  const harnessBits: string[] = [];
  if (gated.length) harnessBits.push(`${gated.length} MCP-gated skill${gated.length === 1 ? "" : "s"}`);
  if (r.npx_skills.length) harnessBits.push(`${r.npx_skills.length} npx skill${r.npx_skills.length === 1 ? "" : "s"}`);
  const unloadedMcps = r.mcps.filter((m) => !m.loaded).map((m) => m.id);
  if (unloadedMcps.length) harnessBits.push(`MCP: ${unloadedMcps.join(", ")}`);
  if (r.plugins.length) harnessBits.push(`plugins: ${r.plugins.join(", ")}`);
  if (r.commands.length) harnessBits.push(`commands: ${r.commands.slice(0, 6).join(" ")}`);
  if (harnessBits.length) {
    out.push("");
    out.push(`🔒 needs the harness (won't soft-load): ${harnessBits.join(" · ")}`);
  }

  out.push("");
  if (r.pin_written && r.pin_previous && r.pin_previous !== r.profile) {
    out.push(`📌 repinned .cue-profile: ${r.pin_previous} → ${r.profile} (replaced a different pin)`);
  } else if (r.pin_written) {
    out.push(`📌 pinned .cue-profile → ${r.profile}`);
  } else if (r.pin_previous === r.profile) {
    out.push(`📌 already pinned → ${r.profile}`);
  } else {
    out.push(`📌 pin skipped`);
  }
  out.push(`↻ full fidelity (MCPs + /slash): run \`${r.reexec_cmd}\` resumes this conversation`);
  process.stdout.write(out.join("\n") + "\n");
}

export async function run(args: string[]): Promise<number> {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }

  let profile: string | null = null;
  // undefined → auto-detect the running session; only set when --active passed.
  let active: string | undefined;
  let json = false;
  let noPin = false;
  let pick = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") json = true;
    else if (a === "--no-pin") noPin = true;
    else if (a === "--pick") pick = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--active") active = args[++i] ?? undefined;
    else if (!a.startsWith("-") && profile === null) profile = a;
  }

  const cwd = process.cwd();

  // --pick: just surface the candidates, don't act.
  if (pick) {
    const known = new Set(await listProfiles());
    const dets = detectProfileV2(cwd).filter((d) => known.has(d.profile));
    if (json) {
      process.stdout.write(JSON.stringify({ candidates: dets }, null, 2) + "\n");
    } else if (dets.length === 0) {
      process.stdout.write("No profile confidently matches this directory.\n");
    } else {
      process.stdout.write("Detected profiles for this directory:\n");
      for (const d of dets.slice(0, 5)) {
        process.stdout.write(`  ${Math.round(d.confidence * 100)}%  ${d.profile}  — ${d.reasons.slice(0, 2).join(", ")}\n`);
      }
      process.stdout.write(`\nSummon one: cue summon <profile>\n`);
    }
    return 0;
  }

  let result: SummonResult;
  try {
    result = await summon({ cwd, profile, active, noPin, dryRun });
  } catch (err) {
    process.stderr.write(`cue summon: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printHuman(result);
  }
  return 0;
}
