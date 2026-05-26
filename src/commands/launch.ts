/**
 * `cue launch <agent>` — the hot path.
 *
 * Flow: resolve(cwd) → if none, runPicker() → materializeRuntime() → exec.
 *
 * Bypass paths:
 *   --cue-profile <name>   force this profile
 *   --cue-pick             always open picker (ignore pins)
 *   --dry-run              everything except the final exec; prints env
 *
 * Recursion guard via CUE_LAUNCHING=1 in child env.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

import { loadProfile, listProfiles, parseProfileSelector } from "../lib/profile-loader";
import { resolveProfileForCwd } from "../lib/cwd-resolver";
import { DIVIDER_PREFIX, runPicker, type PickerOption } from "../lib/picker";
import { materializeRuntime } from "../lib/runtime-materializer";
import { resolveLocalSkill, listAllSkillIds } from "../lib/resolver-local";
import { detectKittyTerminal, kittyPlaceholderLabel, transmitKittyImage } from "../lib/kitty-image";
import { computeStats } from "../lib/analytics";
import type { ResolvedProfile } from "../../profiles/_types";
import { hasWorkspaces, getActiveWorkspace, computeOverrides, resolveWorkspaceForCwd } from "../lib/workspaces";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  agent: "claude" | "codex" | null;
  override: string | null;
  forcePick: boolean;
  dryRun: boolean;
  rematerialize: boolean;
  /** `--subset "<prompt>"` — filter skills to those relevant to the prompt before materializing. */
  subset: string | null;
  passthrough: string[];
}

function parse(args: string[]): ParsedArgs {
  let agent: ParsedArgs["agent"] = null;
  let override: string | null = null;
  let forcePick = false;
  let dryRun = false;
  let rematerialize = false;
  let subset: string | null = null;
  const passthrough: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (i === 0 && (a === "claude" || a === "codex")) {
      agent = a;
    } else if (a === "--cue-profile") {
      override = args[++i] ?? null;
    } else if (a === "--cue-pick") {
      forcePick = true;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--rematerialize") {
      rematerialize = true;
    } else if (a === "--subset") {
      subset = args[++i] ?? null;
    } else {
      passthrough.push(a!);
    }
  }
  // Env var fallback for users who want subset on every launch without retyping.
  if (!subset && process.env.CUE_SMART_SUBSET && passthrough.length > 0) {
    subset = passthrough.join(" ");
  }
  return { agent, override, forcePick, dryRun, rematerialize, subset, passthrough };
}

// ---------------------------------------------------------------------------
// Workspace overrides — merge active workspace env into profile
// ---------------------------------------------------------------------------

async function applyWorkspaceOverrides(profile: ResolvedProfile): Promise<ResolvedProfile> {
  if (!hasWorkspaces(profile.name)) return profile;

  // Feature 4: .cue-workspace auto-switch takes precedence over global active
  const cwdWs = resolveWorkspaceForCwd(profile.name, process.cwd());
  const activeWs = cwdWs ?? getActiveWorkspace(profile.name);
  if (!activeWs) return profile;

  const overrides = computeOverrides(profile.name, activeWs);
  if (!overrides) return profile;

  let result: ResolvedProfile = {
    ...profile,
    env: { ...profile.env, ...overrides.env },
  };

  // Feature 6: Workspace persona override replaces profile persona
  if (overrides.personaOverride) {
    result = { ...result, persona: overrides.personaOverride };
  }

  // Feature 2: Workspace-specific skills appended to profile.skills.local
  if (overrides.skills && overrides.skills.length > 0) {
    const existingIds = new Set(result.skills.local.map(s => s.id));
    const newSkills = overrides.skills
      .filter(id => !existingIds.has(id))
      .map(id => ({ id }));
    result = {
      ...result,
      skills: {
        ...result.skills,
        local: [...result.skills.local, ...newSkills],
      },
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Config dir helper
// ---------------------------------------------------------------------------

function configDir(): string {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, "cue")
    : join(homedir(), ".config", "cue");
}

// ---------------------------------------------------------------------------
// Exec helper — spawn with inherited stdio so interactive sessions work
// ---------------------------------------------------------------------------

function execAgent(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((res) => {
    const child = spawn(bin, args, { env, stdio: "inherit" });
    child.on("exit", (code) => res(code ?? 0));
    child.on("error", () => res(127));
  });
}

export interface TmuxAnnounceExtras {
  /** Token-overhead summary: dot = 🟢/🟡/🟠/🔴, size = "8K". Both optional. */
  overhead?: { dot: string; size: string };
  /** "!" when quickDiagnose returned warnings; "" otherwise. */
  health?: string;
}

/**
 * Surface the active profile to tmux so status lines can show what's loaded.
 * Channels (pick whichever fits the user's setup):
 *   1. OSC 2 pane title — zero-config; tmux exposes it as `#{pane_title}`.
 *   2. tmux pane-local user options:
 *        @cue_profile          full styled string
 *        @cue_profile_name     "postizz+blog-writer+trendradar"
 *        @cue_profile_icon     primary icon only: "📮"
 *        @cue_profile_icons    every part's icon concatenated: "📮✍️📡"
 *        @cue_agent            "claude" / "codex"
 *        @cue_overhead_dot     "🟢"/"🟡"/"🟠"/"🔴" — token band of always-on overhead
 *        @cue_overhead_size    "8K" — total always-on size
 *        @cue_health           "!" when doctor flagged issues, "" when clean
 *   3. CUE_PROFILE / CUE_AGENT env vars on the child — for shell prompts.
 *
 * No-op outside tmux. Opt-out via `CUE_TMUX_TITLE=0`.
 *
 * `icons` is an array of one entry per profile part, primary first. Empty
 * strings are filtered out so missing icons don't introduce padding.
 */
function announceTmuxProfile(
  profileName: string,
  agentKind: string,
  icons: string[],
  childEnv: NodeJS.ProcessEnv,
  extras: TmuxAnnounceExtras = {},
): void {
  const friendly = agentKind === "claude-code" ? "claude" : agentKind;
  childEnv.CUE_PROFILE = profileName;
  childEnv.CUE_AGENT = friendly;

  if (!process.env.TMUX || process.env.CUE_TMUX_TITLE === "0") return;
  const cleanIcons = icons.filter((i) => i && i.trim().length > 0);
  const iconStr = cleanIcons.join("");
  const primaryIcon = cleanIcons[0] ?? "";
  const title = iconStr
    ? `${friendly} · ${iconStr} ${profileName}`
    : `${friendly} · ${profileName}`;
  const pane = process.env.TMUX_PANE ?? "";

  try {
    process.stdout.write(`\x1b]2;${title}\x07`);
  } catch { /* best-effort */ }

  if (pane) {
    try {
      const { spawnSync } = require("node:child_process");
      const setOpt = (key: string, val: string) =>
        spawnSync("tmux", ["set-option", "-p", "-t", pane, key, val], { stdio: "ignore" });
      setOpt("@cue_profile", title);
      setOpt("@cue_profile_name", profileName);
      setOpt("@cue_profile_icon", primaryIcon);
      setOpt("@cue_profile_icons", iconStr);
      setOpt("@cue_agent", friendly);
      setOpt("@cue_overhead_dot", extras.overhead?.dot ?? "");
      setOpt("@cue_overhead_size", extras.overhead?.size ?? "");
      setOpt("@cue_health", extras.health ?? "");
    } catch { /* best-effort */ }
  }

  process.on("exit", () => {
    try {
      process.stdout.write("\x1b]2;\x07");
    } catch { /* ok */ }
    if (pane) {
      try {
        const { spawnSync } = require("node:child_process");
        const keys = [
          "@cue_profile",
          "@cue_profile_name",
          "@cue_profile_icon",
          "@cue_profile_icons",
          "@cue_agent",
          "@cue_overhead_dot",
          "@cue_overhead_size",
          "@cue_health",
        ];
        for (const key of keys) {
          spawnSync("tmux", ["set-option", "-p", "-u", "-t", pane, key], { stdio: "ignore" });
        }
      } catch { /* ok */ }
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Expand the wildcard `* /*` skill ref (slash-escaped here to avoid closing
 * this JSDoc) to the full set of installed local skill IDs. Mutates
 * `profile.skills.local` in place. Other refs are preserved and any
 * wildcards inherit the original ref's metadata (agents scoping, etc.).
 *
 * Used by both the launch hot path and the picker `details` callback so the
 * shown summary matches what materializeRuntime will actually link.
 */
async function expandWildcards(profile: ResolvedProfile): Promise<void> {
  if (!profile.skills.local.some((s) => s.id === "*/*")) return;
  const allIds = await listAllSkillIds();
  const wildcard = profile.skills.local.find((s) => s.id === "*/*")!;
  const existing = new Set(profile.skills.local.filter((s) => s.id !== "*/*").map((s) => s.id));
  profile.skills.local = [
    ...profile.skills.local.filter((s) => s.id !== "*/*"),
    ...allIds.filter((id) => !existing.has(id)).map((id) => ({ ...wildcard, id })),
  ];
}

/**
 * Compact human-readable summary of what a profile would load. Each returned
 * string is one line (or wrapped block) in the picker's post-pick log.
 *
 * When `parts` is supplied and contains more than one entry, the summary
 * shows a composite breakdown after the skills count — e.g.
 * `skills    53  ← skill-writer:8 + core:12 + ecc:33`.
 *
 * Colors are emitted only when stdout is a TTY and `NO_COLOR` is unset.
 */
const LIST_TRUNCATE = 8;
const COMMANDS_PER_LINE = 4;
const LABEL_WIDTH = 10; // "commands  " — keep visually aligned

export function formatProfileSummary(
  profile: ResolvedProfile,
  parts?: ResolvedProfile[],
): string[] {
  const c = colorFns();
  const label = (s: string) => c.cyan(s.padEnd(LABEL_WIDTH));
  const indent = " ".repeat(LABEL_WIDTH);
  const lines: string[] = [];

  const localCount = profile.skills.local.length;
  const npxCount = profile.skills.npx.length;
  const totalSkills = localCount + npxCount;
  if (totalSkills > 0) {
    const breakdown = npxCount > 0 ? ` (${localCount} local, ${npxCount} npx)` : "";
    let line = `${label("skills")}${c.yellow(String(totalSkills))}${c.dim(breakdown)}`;
    if (parts && parts.length > 1) {
      const split = parts
        .map((p) => `${p.icon ? `${p.icon} ` : ""}${p.name}:${p.skills.local.length + p.skills.npx.length}`)
        .join(" + ");
      line += `  ${c.dim("←")} ${c.dim(split)}`;
    }
    lines.push(line);
    if (localCount >= 5) {
      const cats = categoryBreakdown(profile.skills.local.map((s) => s.id));
      if (cats) lines.push(`${indent}${c.dim(cats)}`);
    }
  }
  if (profile.mcps.length > 0) {
    lines.push(`${label("mcps")}${truncateList(profile.mcps.map((m) => m.id))}`);
  }
  if (profile.plugins.length > 0) {
    lines.push(`${label("plugins")}${truncateList(profile.plugins.map((pl) => pl.id))}`);
  }
  if (profile.commands && profile.commands.length > 0) {
    const slashed = profile.commands.map((cmd) => `/${basename(cmd, ".md")}`);
    lines.push(`${label("commands")}${wrapItems(slashed, COMMANDS_PER_LINE, LABEL_WIDTH)}`);
  }
  if (profile.agents && profile.agents.length > 0) {
    lines.push(`${label("agents")}${profile.agents.join("  ")}`);
  }
  return lines;
}

/**
 * Group skill ids by their `<category>/<slug>` prefix and emit a compact
 * `meta:25  gstack:16  plan:5 …` summary. Sorted by descending count.
 * Returns "" when there are no skills.
 */
export function categoryBreakdown(skillIds: string[], max = 7): string {
  if (skillIds.length === 0) return "";
  const groups = new Map<string, number>();
  for (const id of skillIds) {
    const parts = id.split("/");
    const cat = parts.length > 1 ? parts[0]! : "other";
    groups.set(cat, (groups.get(cat) ?? 0) + 1);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, max).map(([cat, n]) => `${cat}:${n}`).join("  ");
  if (sorted.length > max) {
    return `${head}  +${sorted.length - max} cats`;
  }
  return head;
}

/** Wrap a list of items into rows of `perRow`, separated by two spaces, with
 * continuation lines indented to align with the first item. */
function wrapItems(items: string[], perRow: number, indent: number): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow).join("  "));
  }
  const pad = " ".repeat(indent);
  return rows.join(`\n${pad}`);
}

function truncateList(items: string[], max = LIST_TRUNCATE): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")}, +${items.length - max} more`;
}

/** Lazy color helpers. Disabled when stdout isn't a TTY or `NO_COLOR` is set. */
function colorFns() {
  const enabled = process.stdout.isTTY === true && !process.env.NO_COLOR;
  const wrap = (code: string) => (s: string) => enabled ? `\x1b[${code}m${s}\x1b[0m` : s;
  return {
    cyan: wrap("36"),
    yellow: wrap("33"),
    dim: wrap("2"),
    bold: wrap("1"),
  };
}

// ---------------------------------------------------------------------------
// Token-overhead breakdown
//
// Claude Code skills use progressive disclosure: the YAML frontmatter
// (name + description) is always in the model's system prompt so it can
// decide when to invoke a skill; the body only loads when the skill fires.
// So the *real* always-on overhead is the frontmatter sum — not the body
// sum, which is only the ceiling if every skill activates in one session.
//
// Two pure helpers below (testable without filesystem) plus an orchestrator
// at the call site that supplies them with real file measurements.
// ---------------------------------------------------------------------------

export interface SkillTokens {
  /** Tokens for the YAML frontmatter (always-on, loaded into skill router). */
  frontmatter: number;
  /** Tokens for the rest of SKILL.md (load-on-activate). */
  body: number;
}

export interface TokenBreakdown {
  /** Sum of frontmatter tokens across every skill — the real always-on cost. */
  alwaysOn: number;
  /** Sum of body tokens — the ceiling if every skill activates this session. */
  maxIfAllActivate: number;
  /** Skill count for the header line. */
  totalSkills: number;
  /**
   * Per-profile attribution of `alwaysOn` for composite selectors (length > 1).
   * Each skill is credited to the first part that declares it, so per-part
   * numbers sum to `alwaysOn` (no double-counting from overlap). Empty for
   * single-part profiles. `icon` carries the part's emoji when declared.
   */
  byProfile: { name: string; icon?: string; tokens: number; skillCount: number }[];
  /** Skills sorted by body size, descending — for the "heaviest if activated" hint. */
  heaviestBodies: { id: string; tokens: number }[];
}

export function computeTokenBreakdown(
  profile: ResolvedProfile,
  parts: ResolvedProfile[] | undefined,
  tokensForSkill: (id: string) => SkillTokens,
): TokenBreakdown {
  let alwaysOn = 0;
  let maxIfAllActivate = 0;
  const heaviestBodies: { id: string; tokens: number }[] = [];
  for (const s of profile.skills.local) {
    const { frontmatter, body } = tokensForSkill(s.id);
    alwaysOn += frontmatter;
    maxIfAllActivate += body;
    if (body > 0) heaviestBodies.push({ id: s.id, tokens: body });
  }
  heaviestBodies.sort((a, b) => b.tokens - a.tokens);

  const byProfile: TokenBreakdown["byProfile"] = [];
  if (parts && parts.length > 1) {
    const credited = new Set<string>();
    for (const part of parts) {
      let pTokens = 0;
      let pCount = 0;
      for (const s of part.skills.local) {
        if (credited.has(s.id)) continue;
        credited.add(s.id);
        const { frontmatter } = tokensForSkill(s.id);
        if (frontmatter > 0) {
          pTokens += frontmatter;
          pCount += 1;
        }
      }
      byProfile.push({ name: part.name, icon: part.icon, tokens: pTokens, skillCount: pCount });
    }
  }

  return {
    alwaysOn,
    maxIfAllActivate,
    totalSkills: profile.skills.local.length,
    byProfile,
    heaviestBodies,
  };
}

/**
 * Extract frontmatter byte length from a SKILL.md string. Returns
 * `{ frontmatter, body }` byte counts. Falls back to a token count of zero
 * when the file lacks the leading `---` block (still legal but rare).
 */
export function splitSkillBytes(source: string): { frontmatter: number; body: number } {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { frontmatter: 0, body: source.length };
  }
  // Find the closing `---` on its own line. Search starts after the opener.
  const closer = source.indexOf("\n---", 4);
  if (closer === -1) {
    return { frontmatter: source.length, body: 0 };
  }
  // Include the closing `---\n` in the frontmatter block.
  const fmEnd = source.indexOf("\n", closer + 1);
  const cut = fmEnd === -1 ? source.length : fmEnd + 1;
  return { frontmatter: cut, body: source.length - cut };
}

/**
 * Map an always-on token count to the bands we color in the CLI banner and
 * the tmux pane-border badge. Single source of truth so the two displays
 * never drift apart on threshold values.
 */
export function tokenLevelEmoji(alwaysOn: number): "🔴" | "🟠" | "🟡" | "🟢" {
  return alwaysOn > 15000 ? "🔴"
    : alwaysOn > 10000 ? "🟠"
      : alwaysOn > 5000 ? "🟡"
        : "🟢";
}

/** Format the token-overhead block. Returns `[]` under the 2K always-on floor. */
export function formatTokenWarning(b: TokenBreakdown): string[] {
  if (b.alwaysOn < 2000) return [];
  const c = colorFns();
  const lines: string[] = [];
  const level = tokenLevelEmoji(b.alwaysOn);
  const alwaysK = `${(b.alwaysOn / 1000).toFixed(1)}K`;
  lines.push(
    `${level} Skill overhead: ${c.yellow(`~${alwaysK}`)} always-on (${b.totalSkills} skills)`,
  );

  // `byProfile[0]` is the primary (the profile the user actively picked);
  // the rest are companions added via the multiselect. We tag whichever part
  // weighs the most as "← heaviest" purely for info, but only consider
  // *companions* as candidates for the "Drop X" hint below — telling the
  // user to drop their primary is never the right advice.
  let heaviestPart: { name: string; tokens: number } | undefined;
  let heaviestDroppable: { name: string; tokens: number } | undefined;
  if (b.byProfile.length > 1) {
    heaviestPart = [...b.byProfile].sort((a, x) => x.tokens - a.tokens)[0];
    heaviestDroppable = [...b.byProfile.slice(1)].sort((a, x) => x.tokens - a.tokens)[0];
    const heaviestName = heaviestPart!.name;
    const segments = b.byProfile.map((p) => {
      const kStr = `${(p.tokens / 1000).toFixed(1)}K`;
      const iconPart = p.icon ? `${p.icon} ` : "";
      const label = `${iconPart}${p.name} ${kStr}`;
      return p.name === heaviestName
        ? `${c.bold(label)} ${c.dim("← heaviest")}`
        : c.dim(label);
    });
    lines.push(`   By profile:  ${segments.join(c.dim("  ·  "))}`);
  }

  if (b.maxIfAllActivate > 0) {
    const maxK = `${(b.maxIfAllActivate / 1000).toFixed(0)}K`;
    lines.push(
      `   ${c.dim(`~${maxK} max if every skill activates (bodies load on demand)`)}`,
    );
  }

  const top3 = b.heaviestBodies.slice(0, 3);
  if (top3.length > 0) {
    const items = top3
      .map((s) => `${s.id.split("/").pop()} (${(s.tokens / 1000).toFixed(1)}K)`)
      .join(", ");
    lines.push(`   ${c.dim(`Heaviest bodies:  ${items}`)}`);
  }

  if (heaviestDroppable && heaviestDroppable.tokens > 3000) {
    const saveK = `${(heaviestDroppable.tokens / 1000).toFixed(1)}K`;
    lines.push(
      `   💡 Drop ${c.bold(`"${heaviestDroppable.name}"`)} to save ~${saveK} always-on`,
    );
  } else if (b.alwaysOn > 10000) {
    lines.push(`   💡 Run \`cue skills audit\` to trim unused skills.`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Doctor warnings — inline summary of diagnostics on first build after a
// rebuild. Replaces the older "run cue doctor to see" generic message.
// ---------------------------------------------------------------------------

export interface DoctorWarning {
  code: string;
  message: string;
}

/**
 * Format the top doctor warnings as a small block. Returns `[]` when there
 * are no warnings so callers can skip the leading blank line.
 *
 * Top-3 inline, with a "…and N more" footer and a `→ cue doctor --fix`
 * pointer when there's anything to fix.
 */
export function formatDoctorWarnings(warnings: DoctorWarning[]): string[] {
  if (warnings.length === 0) return [];
  const c = colorFns();
  const lines: string[] = [];
  const n = warnings.length;
  lines.push(c.yellow(`⚠ cue doctor (${n} warning${n > 1 ? "s" : ""}):`));
  for (const w of warnings.slice(0, 3)) {
    lines.push(`   ${c.yellow(w.code)}  ${w.message}`);
  }
  if (n > 3) {
    lines.push(`   ${c.dim(`…and ${n - 3} more`)}`);
  }
  lines.push(`   ${c.dim("→ cue doctor --fix")}`);
  return lines;
}

/**
 * Sort picker options. Pure function so tests don't need filesystem.
 *
 * Priority order:
 *   1. Pinned profile (if any) — pinned to top so resuming is one Enter.
 *   2. Used profiles, descending by session count.
 *   3. Never-used profiles, alphabetical (with `full` first as a sensible default).
 *
 * Pass `usage` empty or undefined to fall back to the legacy alphabetical-with-
 * full-first ordering.
 */
export function sortProfileOptions(
  opts: PickerOption[],
  pinnedProfile?: string,
  usage?: Map<string, number>,
): PickerOption[] {
  return [...opts].sort((a, b) => {
    // `top` (the Default entry) always wins, regardless of pin or usage.
    if (a.top && !b.top) return -1;
    if (b.top && !a.top) return 1;
    if (a.value === pinnedProfile) return -1;
    if (b.value === pinnedProfile) return 1;
    const ua = usage?.get(a.value) ?? 0;
    const ub = usage?.get(b.value) ?? 0;
    if (ua !== ub) return ub - ua;
    if (ua === 0) {
      if (a.value === "full") return -1;
      if (b.value === "full") return 1;
    }
    return a.value.localeCompare(b.value);
  });
}

/**
 * Format a relative-time string for the picker's recent-section hints.
 * `today` / `yesterday` / `Nd ago` / ISO date. Empty string when `iso` is null.
 */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  const day = 24 * 3600 * 1000;
  if (diffMs < day) return "today";
  const days = Math.floor(diffMs / day);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().split("T")[0]!;
}

/**
 * Build a structured picker order: Default → Recent section → All section.
 *
 * Recent = top `recentLimit` profiles by session count whose `lastUsed` is
 * non-null. Empty when nothing's been used yet — the Recent divider is
 * skipped in that case so the picker stays terse for fresh installs.
 */
export interface RecentEntry {
  name: string;
  sessions: number;
  lastUsed: string | null;
}

export function buildPickerSections(
  defaultOpt: PickerOption | undefined,
  allProfileOpts: PickerOption[],
  recent: RecentEntry[],
  recentLimit = 3,
  now = Date.now(),
): PickerOption[] {
  const result: PickerOption[] = [];
  if (defaultOpt) result.push(defaultOpt);

  const eligible = recent
    .filter((r) => r.sessions > 0 && r.lastUsed)
    .slice(0, recentLimit)
    .map((r) => ({ ...r, opt: allProfileOpts.find((o) => o.value === r.name) }))
    .filter((r): r is RecentEntry & { opt: PickerOption } => r.opt !== undefined);

  const recentSet = new Set(eligible.map((r) => r.name));

  if (eligible.length > 0) {
    result.push({
      value: `${DIVIDER_PREFIX}recent`,
      label: "  ── Recent ──",
      hint: "",
      divider: true,
    });
    for (const r of eligible) {
      const when = relativeTime(r.lastUsed, now);
      const hint = `${r.sessions}× session${r.sessions > 1 ? "s" : ""}, last ${when}`;
      result.push({ ...r.opt, hint });
    }
  }

  const rest = allProfileOpts.filter((o) => !recentSet.has(o.value));
  if (rest.length > 0) {
    result.push({
      value: `${DIVIDER_PREFIX}all`,
      label: "  ── All profiles ──",
      hint: "",
      divider: true,
    });
    result.push(...rest);
  }

  return result;
}

/**
 * Read the user's Default-profile composition from
 * `<configDir>/default-profile`. Format: one profile name per line; `#`
 * comments and blank lines ignored. `core` is always included even if the
 * user removed it from the file. Missing file → just `core`.
 *
 * Returns the composite selector (e.g. `"core"` or `"core+skill-writer+ecc"`).
 */
export function getDefaultSelector(
  configDirPath: string = configDir(),
  readFile: (p: string) => string = (p) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("node:fs") as typeof import("node:fs")).readFileSync(p, "utf8");
  },
): string {
  const path = join(configDirPath, "default-profile");
  let extras: string[] = [];
  try {
    const raw = readFile(path);
    extras = raw
      .split(/[\n+]/)
      .map((s) => s.trim())
      .map((s) => s.replace(/#.*$/, "").trim())
      .filter((s) => s.length > 0 && s !== "core");
  } catch { /* file missing -> core only */ }
  // Dedupe while preserving order.
  const seen = new Set<string>(["core"]);
  const parts = ["core"];
  for (const e of extras) {
    if (!seen.has(e)) { seen.add(e); parts.push(e); }
  }
  return parts.join("+");
}

async function listProfileOptions(pinnedProfile?: string): Promise<PickerOption[]> {
  const names = await listProfiles();
  const knownNames = new Set(names);
  const opts: PickerOption[] = [];
  const kitty = await detectKittyTerminal();
  const profilesRoot = process.env.CUE_PROFILES_DIR ?? process.env.SOUL_PROFILES_DIR ?? join(
    resolve(new URL(import.meta.url).pathname, "..", "..", ".."),
    "profiles",
  );
  // Stable per-process image IDs (1..255) for kitty's 256-color FG-encoded
  // placeholder protocol. We have at most a handful of iconImage profiles, so
  // overflow isn't a concern in practice — assert anyway in transmitKittyImage.
  let nextImageId = 1;
  // Each profile gets one row; companion combos are no longer flattened into
  // the list — runPicker surfaces them as a multiselect *after* the user picks
  // a profile, using each option's `recommends` field below.
  for (const name of names) {
    try {
      const p = await loadProfile(name);
      let iconLabel: string;
      if (kitty && p.iconImage && nextImageId <= 255) {
        const imgPath = resolve(profilesRoot, name, p.iconImage);
        const id = nextImageId++;
        // Transmit + virtual placement; placeholder text in the label triggers
        // the actual paint when @clack/prompts renders the option.
        transmitKittyImage(imgPath, id, 2, 1);
        iconLabel = kittyPlaceholderLabel(id, 2, 1);
      } else if (p.icon) {
        iconLabel = p.icon;
      } else {
        iconLabel = "";
      }
      const label = iconLabel ? `${iconLabel} ${name}` : name;
      const recommends = p.recommends.filter((r) => r !== name && knownNames.has(r));
      opts.push({ value: name, label, hint: p.description, recommends });
    } catch {
      opts.push({ value: name, label: name, hint: "" });
    }
  }

  // Build the Default entry (composite of core + user-added profiles).
  // Pressing Enter on the picker selects it (it's first in the section order).
  let defaultOpt: PickerOption | undefined;
  try {
    const defaultSelector = getDefaultSelector();
    const parts = defaultSelector.split("+");
    const hint = parts.length === 1
      ? `→ ${parts[0]}`
      : `→ ${parts.join(" + ")}`;
    defaultOpt = { value: defaultSelector, label: "⭐ Default", hint, top: true };
  } catch { /* non-fatal — picker still works without the Default entry */ }

  // Pull usage data so most-picked entries float to the top. Combo pins like
  // "blog-writer+postizz" are naturally separate keys in the analytics log.
  const usage = new Map<string, number>();
  const recent: RecentEntry[] = [];
  try {
    for (const s of computeStats()) {
      usage.set(s.profile, s.sessions);
      recent.push({ name: s.profile, sessions: s.sessions, lastUsed: s.last_used });
    }
  } catch {
    // Analytics is best-effort — never block the picker on a missing/corrupt log.
  }
  const sorted = sortProfileOptions(opts, pinnedProfile, usage);
  return buildPickerSections(defaultOpt, sorted, recent);
}

async function loadMcpRegistry(agent: "claude-code" | "codex"): Promise<Record<string, unknown>> {
  const root = process.env.CUE_REPO_ROOT ?? process.env.SOUL_REPO_ROOT ?? resolve(
    new URL(import.meta.url).pathname,
    "..",
    "..",
    "..",
  );
  // Files to merge, in priority order. The master `claude.sanitized.json` wins
  // on key collisions; `claude_runtime.sanitized.json` is the live snapshot
  // captured from the user's actual `~/.claude.json` (covers servers
  // registered at runtime but not yet promoted to the master registry).
  // Without this merge, profiles like `marketing` that reference
  // `reddit`/`google-ads-mcp`/`meta-ads`/`Higgsfield` (runtime-only entries)
  // would silently drop those MCPs at materialize time.
  const files = agent === "claude-code"
    ? ["claude_runtime.sanitized.json", "claude.sanitized.json"]
    : ["codex.sanitized.json"];

  const merged: Record<string, unknown> = {};
  for (const file of files) {
    const path = join(root, "resources", "mcps", "configs", file);
    try {
      const text = await readFile(path, "utf8");
      const raw = JSON.parse(text) as { servers?: Record<string, unknown> };
      for (const [k, v] of Object.entries(raw.servers ?? {})) {
        // First file wins (claude_runtime first, then claude master).
        // We want master to win, so only set if not already present.
        if (!(k in merged)) merged[k] = v;
      }
    } catch { /* file missing — skip */ }
  }
  // Second pass: let the master registry override the runtime snapshot
  // (master is the curated source of truth; runtime is just a fallback).
  const masterPath = join(root, "resources", "mcps", "configs",
    agent === "claude-code" ? "claude.sanitized.json" : "codex.sanitized.json");
  try {
    const text = await readFile(masterPath, "utf8");
    const raw = JSON.parse(text) as { servers?: Record<string, unknown> };
    for (const [k, v] of Object.entries(raw.servers ?? {})) {
      merged[k] = v;
    }
  } catch { /* master missing — keep runtime fallbacks */ }

  return merged;
}

async function readSharedClaudeMd(profile?: { name: string; inheritanceChain?: string[] }): Promise<string> {
  const root = process.env.CUE_REPO_ROOT ?? process.env.SOUL_REPO_ROOT ?? resolve(
    new URL(import.meta.url).pathname, "..", "..", "..",
  );
  const baseDir = join(root, "resources", "claude-md");
  const { readdir: rd } = await import("node:fs/promises");
  const parts: string[] = [];

  // Helper: read all .md files from a directory (sorted)
  async function readLayer(dir: string): Promise<void> {
    try {
      const files = (await rd(dir)).filter(f => f.endsWith(".md")).sort();
      for (const f of files) {
        try { parts.push(await readFile(join(dir, f), "utf8")); } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist — skip */ }
  }

  // Layer 1: _always/ (all profiles)
  await readLayer(join(baseDir, "_always"));

  // Layer 2: inheritance chain layers (e.g. _core/ if profile inherits core)
  if (profile?.inheritanceChain) {
    for (const ancestor of profile.inheritanceChain) {
      if (ancestor === profile.name) continue; // skip self, handled in layer 3
      await readLayer(join(baseDir, `_${ancestor}`));
    }
  }

  // Layer 3: profile-specific layer
  if (profile?.name) {
    await readLayer(join(baseDir, profile.name));
  }

  return parts.length ? parts.join("\n") + "\n" : "";
}

async function buildUserClaudeMd(profile: ResolvedProfile, agent: "claude-code" | "codex"): Promise<string> {
  let content = await readSharedClaudeMd(profile) + await readUserClaudeMd(agent);

  // First-time profile suggestion: if no .cue-profile in cwd, inject marker
  const cueProfilePath = join(process.cwd(), ".cue-profile");
  if (!existsSync(cueProfilePath)) {
    content += "\n<!-- cue:first-time-suggest -->\n" +
      "## ⚡ First-Time Setup\n\n" +
      "No `.cue-profile` is pinned to this directory. Before answering the user's first message, " +
      "quickly scan this repo (package.json, Cargo.toml, Dockerfile, etc.) and suggest the best " +
      "profile from `cue list`. Present your suggestion in 3-4 lines with reasoning, then offer " +
      "to pin it with `echo <name> > .cue-profile`. After suggesting, proceed with the user's request.\n\n" +
      "Available profiles:\n```\n" +
      (await getProfileListForStamp()) +
      "```\n\n";
  }

  return content;
}

async function getProfileListForStamp(): Promise<string> {
  try {
    const names = await listProfiles();
    const lines: string[] = [];
    for (const name of names.slice(0, 15)) {
      const yamlPath = join(process.env.CUE_PROFILES_DIR ?? join(resolve(import.meta.dirname, "..", ".."), "profiles"), name, "profile.yaml");
      try {
        const content = readFileSync(yamlPath, "utf8");
        const iconMatch = content.match(/^icon:\s*["']?(.+?)["']?\s*$/m);
        const descMatch = content.match(/^description:\s*["']?(.+?)["']?\s*$/m);
        const icon = iconMatch?.[1] ?? " ";
        const desc = descMatch?.[1]?.slice(0, 60) ?? "";
        lines.push(`${icon} ${name} — ${desc}`);
      } catch {
        lines.push(`  ${name}`);
      }
    }
    return lines.join("\n") + "\n";
  } catch {
    return "";
  }
}

async function readUserClaudeMd(agent: "claude-code" | "codex"): Promise<string> {
  const path =
    agent === "claude-code"
      ? join(homedir(), ".claude", "CLAUDE.md")
      : join(homedir(), ".codex", "AGENTS.md");
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function findRealBinary(name: string): Promise<string | null> {
  const shimDir = join(homedir(), ".local", "bin");
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(":")) {
    if (resolve(dir) === resolve(shimDir)) continue;
    const candidate = join(dir, name);
    try {
      const { stat } = await import("node:fs/promises");
      const st = await stat(candidate);
      if (st.isFile() && (st.mode & 0o111) !== 0) return candidate;
    } catch {
      // not in this dir
    }
  }
  return null;
}

/**
 * Pick the Claude credentials source for runtime materialization.
 *
 * Priority:
 *   1. $CLAUDE_CONFIG_DIR (explicit override — claude-account2 alias, etc.)
 *   2. ~/.claude if it has .credentials.json
 *   3. authmux parallel profile with the freshest .credentials.json mtime
 *      (so users who manage Claude accounts only via authmux don't have to
 *      re-login per cue profile — every cue profile inherits whichever
 *      account they touched most recently)
 *   4. ~/.claude as last-resort fallback (materializer will skip the copy if
 *      .credentials.json isn't there)
 *
 * Once the source is chosen, we run a "freshness sweep": Anthropic's OAuth
 * rotates the refresh token on every refresh, so any per-profile cue runtime
 * that ran more recently than the source has *the* live refresh token, and
 * source's copy is dead. Without healing, materializing a new profile would
 * copy the dead token in and force a re-login. `syncFreshestToSource` looks
 * across `runtime/<profile>/claude/.credentials.json` for matching
 * accountUuid and copies the freshest one back to source.
 */
async function resolveClaudeCredentialsSource(): Promise<string> {
  const picked = await pickClaudeCredentialsSource();
  // Heal source from freshest sibling runtime (if any). Silent best-effort.
  try {
    const { syncFreshestToSource } = await import("../lib/credentials-sync");
    const runtimeRoot = join(configDir(), "runtime");
    const result = await syncFreshestToSource(picked, runtimeRoot);
    if (result.synced) {
      // Tiny breadcrumb so users can see when the heal kicked in. Stays on
      // stderr so it doesn't pollute pipelines or `claude --print` output.
      process.stderr.write(
        `▸ cue: refreshed source credentials from a sibling runtime (rotated refresh-token healed)\n`,
      );
    }
  } catch { /* heal is best-effort — never block the launch */ }
  return picked;
}

async function pickClaudeCredentialsSource(): Promise<string> {
  if (process.env.CLAUDE_CONFIG_DIR) return process.env.CLAUDE_CONFIG_DIR;

  const homeClaude = join(homedir(), ".claude");
  if (existsSync(join(homeClaude, ".credentials.json"))) return homeClaude;

  try {
    const { spawnSync } = await import("node:child_process");
    const { statSync } = await import("node:fs");
    const res = spawnSync("authmux", ["parallel", "--list", "--json"], {
      encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"],
    });
    if (res.status === 0 && res.stdout) {
      const parsed = JSON.parse(res.stdout) as { data?: { profiles?: Array<{ name: string; configDir: string }> } };
      const profiles = parsed?.data?.profiles ?? [];
      const withMtime = profiles
        .map((p) => {
          const credsPath = join(p.configDir, ".credentials.json");
          let mtime = 0;
          try { mtime = statSync(credsPath).mtimeMs; } catch { /* missing */ }
          return { ...p, mtime };
        })
        .filter((p) => p.mtime > 0)
        .sort((a, b) => b.mtime - a.mtime);
      const pick = withMtime[0];
      if (pick) {
        process.stderr.write(`▸ cue: inheriting auth from authmux profile "${pick.name}"\n`);
        return pick.configDir;
      }
    }
  } catch { /* authmux not installed or query failed — fall through */ }

  return homeClaude;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function run(args: string[]): Promise<number> {
  // Recursion guard
  if (process.env.CUE_LAUNCHING === "1") {
    process.stderr.write(
      "cue: shim recursion detected — check PATH ordering (~/.local/bin must precede the real claude/codex location)\n",
    );
    return 2;
  }

  const parsed = parse(args);
  if (!parsed.agent) {
    process.stderr.write("cue launch: missing agent (use 'claude' or 'codex')\n");
    return 1;
  }
  const agentKind = parsed.agent === "claude" ? "claude-code" : "codex";

  // Resolve profile.
  const cwd = process.cwd();
  // Normalize paths (resolve symlinks, strip trailing slashes) so an explicit
  // CLAUDE_CONFIG_DIR=$HOME/.claude (or $HOME/.claude/) doesn't trigger
  // account-alias mode.
  const ccd = process.env.CLAUDE_CONFIG_DIR;
  let isAccountAlias = false;
  if (ccd) {
    const defaultDir = resolve(homedir(), ".claude");
    const setDir = resolve(ccd);
    isAccountAlias = setDir !== defaultDir;
  }
  const existingResolved = await resolveProfileForCwd({
    cwd,
    homeDir: homedir(),
    configDir: configDir(),
    override: parsed.override,
  });
  // Force picker if --cue-pick OR (account alias AND no explicit --cue-profile).
  // Explicit --cue-profile always wins.
  const forcePicker = parsed.forcePick || (isAccountAlias && !parsed.override);
  const resolved = forcePicker ? { source: "none" as const } : existingResolved;
  const existingProfile = existingResolved.source !== "none"
    ? (existingResolved as { source: string; profile: string }).profile
    : undefined;

  let profileName: string;
  // The picker's `details` callback loads + expands the chosen profile so the
  // shown summary matches reality. We stash it here so the post-picker path
  // can reuse it instead of re-loading from disk.
  let cachedProfile: ResolvedProfile | undefined;
  if (resolved.source === "none") {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "cue launch: no profile resolved and stdin is not a TTY; pass --cue-profile <name>\n",
      );
      return 1;
    }
    const options = await listProfileOptions(existingProfile);
    const picked = await runPicker({
      cwd,
      options,
      noPin: isAccountAlias,
      details: async (name) => {
        const loaded = await loadProfile(name);
        await expandWildcards(loaded);
        cachedProfile = loaded;
        const partNames = parseProfileSelector(name);
        let parts: ResolvedProfile[] | undefined;
        if (partNames.length > 1) {
          parts = await Promise.all(partNames.map((p) => loadProfile(p)));
        }
        return formatProfileSummary(loaded, parts);
      },
    });
    profileName = picked.profile;
  } else {
    profileName = (resolved as { source: string; profile: string }).profile;
  }

  // Load + materialize. Reuse the picker-cached profile when available.
  let profile: ResolvedProfile;
  if (cachedProfile && cachedProfile.name === profileName) {
    profile = cachedProfile;
  } else {
    // Try manifest cache first (skips YAML parse + inheritance resolution)
    const profilesDir = join(
      process.env.CUE_REPO_ROOT ?? resolve(new URL(import.meta.url).pathname, "..", "..", ".."),
      "profiles",
    );
    let fromCache = false;
    try {
      const { getCachedManifest } = await import("../lib/manifest-cache");
      const cached = getCachedManifest(profileName, profilesDir);
      if (cached) {
        profile = cached;
        fromCache = true;
      }
    } catch { /* cache miss — fall through */ }

    if (!fromCache) {
      try {
        profile = await loadProfile(profileName);
      } catch (err) {
        process.stderr.write(`cue launch: ${(err as Error).message}\n`);
        return 1;
      }
      await expandWildcards(profile);

      // Populate manifest cache for next launch
      try {
        const { putCachedManifest } = await import("../lib/manifest-cache");
        putCachedManifest(profile, profilesDir);
      } catch { /* non-fatal */ }
    }
  }

  // Credentials source resolution (Claude only):
  //   1. Honor explicit CLAUDE_CONFIG_DIR (set by claude-account2 alias, etc.)
  //   2. Use ~/.claude if it already has .credentials.json
  //   3. Fall back to authmux's most-recently-used parallel profile — so users
  //      who manage Claude accounts via authmux don't have to re-login per
  //      cue profile. authmux's `parallel --list --json` returns each profile's
  //      configDir; we pick the one whose .credentials.json was touched most
  //      recently as a proxy for "the one you actually use."
  const credentialsSource = agentKind === "claude-code"
    ? await resolveClaudeCredentialsSource()
    : undefined;

  // Skill conflict detection is opt-in via `cue skills conflicts` — the
  // regex-based detector produces too many false positives on natural-language
  // SKILL.md prose to be useful as an inline launch-time warning.

  // --rematerialize: force rebuild by deleting the hash file first
  if (parsed.rematerialize) {
    const { rm: rmFile } = await import("node:fs/promises");
    const hashPath = join(configDir(), "runtime", profileName, agentKind === "claude-code" ? "claude" : "codex", ".cue-hash");
    try { await rmFile(hashPath, { force: true }); } catch { /* ok */ }
  }

  // --subset / CUE_SMART_SUBSET: ask claude --print which skills are relevant
  // to the prompt and prune profile.skills.local before materialization. Fails
  // open — any error keeps the full skill set.
  //
  // Auto-mode: if CUE_SMART_SUBSET=1 and no explicit --subset, look up the most
  // recent first prompt captured by resources/hooks/first-prompt-capture.sh for
  // this cwd. Cycle is: first launch loads full set → first prompt gets captured
  // → second+ launch in same cwd auto-subsets using the historical prompt.
  let subsetPrompt: string | null = parsed.subset;
  if (!subsetPrompt && process.env.CUE_SMART_SUBSET) {
    try {
      const { createHash } = await import("node:crypto");
      const cwdAbs = process.cwd();
      const cwdHash = createHash("sha1").update(cwdAbs).digest("hex").slice(0, 16);
      const captured = join(configDir(), "first-prompts", `${cwdHash}.json`);
      const { existsSync, readFileSync } = await import("node:fs");
      if (existsSync(captured)) {
        const { prompt } = JSON.parse(readFileSync(captured, "utf8")) as { prompt?: string };
        if (prompt && prompt.trim().length >= 8) {
          subsetPrompt = prompt;
          process.stderr.write(`  💡 smart-subset using captured first prompt from prior session\n`);
        }
      }
    } catch { /* fail-open — no captured prompt, run full set */ }
  }

  if (subsetPrompt && profile.skills.local.length > 4) {
    try {
      const { selectRelevantSkills } = await import("../lib/skill-subset");
      const ids = profile.skills.local.map((s) => s.id);
      const result = await selectRelevantSkills(ids, subsetPrompt);
      process.stderr.write(`  🎯 smart-subset: ${result.reason}\n`);
      if (result.classified && result.selected.length < ids.length) {
        const keep = new Set(result.selected);
        profile.skills.local = profile.skills.local.filter((s) => keep.has(s.id));
        // Force a rebuild so the smaller skill set actually lands on disk.
        const { rm: rmFile } = await import("node:fs/promises");
        const hashPath = join(configDir(), "runtime", profileName, agentKind === "claude-code" ? "claude" : "codex", ".cue-hash");
        try { await rmFile(hashPath, { force: true }); } catch { /* ok */ }
      }
    } catch (err) {
      process.stderr.write(`  ⚠️  smart-subset failed (${(err as Error).message}) — kept full skill set\n`);
    }
  }

  const runtime = await materializeRuntime({
    profile: await applyWorkspaceOverrides(profile),
    agent: agentKind,
    runtimeRoot: join(configDir(), "runtime"),
    skillSourceLookup: (id) => resolveLocalSkill(id),
    mcpRegistry: await loadMcpRegistry(agentKind),
    userClaudeMd: await buildUserClaudeMd(profile, agentKind),
    credentialsSource,
  });

  // Run quickDiagnose on every launch — it's cheap (filesystem checks) and
  // the result feeds both the first-build inline print AND the tmux health
  // badge. Print is still gated by .doctor-done so subsequent launches stay
  // quiet; the badge stays current regardless.
  let healthBadge = "";
  try {
    const { quickDiagnose } = await import("./status");
    const warnings = quickDiagnose(profileName, profile);
    if (warnings.length > 0) healthBadge = "!";

    if (runtime.rebuilt) {
      try {
        const { existsSync, writeFileSync } = await import("node:fs");
        const doctorFlag = join(configDir(), "runtime", profileName, ".doctor-done");
        if (!existsSync(doctorFlag)) {
          const lines = formatDoctorWarnings(warnings);
          if (lines.length > 0) {
            process.stderr.write("\n");
            for (const l of lines) process.stderr.write(`${l}\n`);
            process.stderr.write("\n");
          }
          writeFileSync(doctorFlag, new Date().toISOString());
        }
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }

  // --rematerialize: report and exit (no exec)
  if (parsed.rematerialize) {
    process.stdout.write(
      JSON.stringify({
        profile: profileName,
        agent: agentKind,
        runtimeDir: runtime.runtimeDir,
        rebuilt: runtime.rebuilt,
        hash: runtime.hash,
      }, null, 2) + "\n",
    );
    process.stdout.write(runtime.rebuilt ? "✅ Rematerialized.\n" : "ℹ️  Already up to date.\n");
    return 0;
  }

  const envKey = agentKind === "claude-code" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    [envKey]: runtime.runtimeDir,
    CUE_LAUNCHING: "1",
  };

  if (parsed.dryRun) {
    process.stdout.write(
      JSON.stringify(
        {
          profile: profileName,
          agent: agentKind,
          runtimeDir: runtime.runtimeDir,
          rebuilt: runtime.rebuilt,
          hash: runtime.hash,
          env: { [envKey]: childEnv[envKey] },
          command: [parsed.agent, ...parsed.passthrough],
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  // Exec the real agent binary.
  const realBin = await findRealBinary(parsed.agent);
  if (!realBin) {
    process.stderr.write(
      `cue launch: couldn't find the real '${parsed.agent}' binary on PATH=${process.env.PATH}\n`,
    );
    return 127;
  }

  // Token budget warning — accurate measurement, actionable advice
  const skillCount = profile.skills.local.length;

  // Skill → MCP dependency check (non-fatal)
  try {
    const { detectMissingDependencies } = await import("../lib/skill-dependencies");
    const skillIds = profile.skills.local.map((s: any) => s.id);
    const mcpIds = profile.mcps.map((m: any) => m.id);
    const missing = detectMissingDependencies(profileName, skillIds, mcpIds);
    if (missing.length > 0) {
      const unique = [...new Set(missing.map(m => m.mcpId))];
      process.stderr.write(`\n⚠️  Missing MCP${unique.length > 1 ? "s" : ""}: ${unique.join(", ")}\n`);
      for (const m of missing.slice(0, 3)) {
        process.stderr.write(`   ${m.skillId} → needs "${m.mcpId}" (${m.source})\n`);
      }
      if (missing.length > 3) process.stderr.write(`   …and ${missing.length - 3} more\n`);
      process.stderr.write(`   Fix: cue mcps add ${unique[0]} --profile ${profileName}\n\n`);
    }
  } catch { /* non-fatal */ }

  // Tracks the breakdown so the tmux badge below can reuse what the CLI
  // banner already computed. Undefined when skillCount is too small to bother
  // — in that case the badge just isn't set, which is fine.
  let alwaysOnForBadge: number | undefined;
  if (skillCount > 5) {
    try {
      const { readFileSync } = await import("node:fs");
      const skillsRoot = join(
        process.env.CUE_REPO_ROOT ?? resolve(new URL(import.meta.url).pathname, "..", "..", ".."),
        "resources", "skills", "skills",
      );
      const tokenCache = new Map<string, SkillTokens>();
      const tokensForSkill = (id: string): SkillTokens => {
        const cached = tokenCache.get(id);
        if (cached) return cached;
        let result: SkillTokens = { frontmatter: 0, body: 0 };
        try {
          const src = readFileSync(join(skillsRoot, id, "SKILL.md"), "utf8");
          const { frontmatter, body } = splitSkillBytes(src);
          result = {
            frontmatter: Math.ceil(frontmatter / 4),
            body: Math.ceil(body / 4),
          };
        } catch { /* skill missing on disk; counts as 0 */ }
        tokenCache.set(id, result);
        return result;
      };

      // For composite selectors, load each part so we can attribute tokens.
      const partNames = parseProfileSelector(profileName);
      let parts: ResolvedProfile[] | undefined;
      if (partNames.length > 1) {
        try {
          parts = await Promise.all(partNames.map((p) => loadProfile(p)));
        } catch { /* breakdown unavailable, total still shown */ }
      }

      const breakdown = computeTokenBreakdown(profile, parts, tokensForSkill);
      alwaysOnForBadge = breakdown.alwaysOn;
      const lines = formatTokenWarning(breakdown);
      if (lines.length > 0) {
        process.stderr.write("\n");
        for (const l of lines) process.stderr.write(`${l}\n`);
        process.stderr.write("\n");
      }
    } catch { /* non-fatal */ }
  }

  // First-run: prompt to star the repo (once ever, non-blocking)
  try {
    const { maybePromptStar } = await import("../lib/star-prompt");
    await maybePromptStar();
  } catch { /* non-fatal */ }

  // Analytics: record session start
  try {
    const { recordEvent } = await import("../lib/analytics");
    const startTs = new Date().toISOString();
    recordEvent({ ts: startTs, event: "start", profile: profileName, agent: agentKind, cwd: process.cwd() });
    // Record end on exit
    process.on("exit", () => {
      try {
        const duration_s = Math.round((Date.now() - new Date(startTs).getTime()) / 1000);
        recordEvent({ ts: new Date().toISOString(), event: "end", profile: profileName, agent: agentKind, cwd: process.cwd(), duration_s });
      } catch { /* best-effort */ }
      // Sync refreshed credentials back to source so next launch has valid tokens
      if (credentialsSource) {
        try {
          const { copyFileSync, existsSync: ex } = require("node:fs");
          const runtimeCreds = join(runtime.runtimeDir, ".credentials.json");
          const sourceCreds = join(credentialsSource, ".credentials.json");
          if (ex(runtimeCreds)) {
            copyFileSync(runtimeCreds, sourceCreds);
          }
        } catch { /* best-effort */ }
      }
    });
  } catch { /* analytics non-fatal */ }

  // Resolve one icon per profile part for the tmux status line. Single-part
  // profiles use `profile.icon` directly; composites load each part so every
  // logo shows up (e.g. 📮✍️📡 for postizz+blog-writer+trendradar). Best-effort
  // — a failed load just drops that icon from the strip.
  let profileIcons: string[] = [];
  try {
    const partNames = parseProfileSelector(profileName);
    if (partNames.length <= 1) {
      profileIcons = profile.icon ? [profile.icon] : [];
    } else {
      profileIcons = await Promise.all(
        partNames.map(async (p) => {
          try {
            const part = await loadProfile(p);
            return part.icon ?? "";
          } catch {
            return "";
          }
        }),
      );
    }
  } catch { /* best-effort */ }

  const overhead = alwaysOnForBadge !== undefined && alwaysOnForBadge >= 2000
    ? {
      dot: tokenLevelEmoji(alwaysOnForBadge),
      size: `${Math.round(alwaysOnForBadge / 1000)}K`,
    }
    : undefined;

  announceTmuxProfile(profileName, agentKind, profileIcons, childEnv, {
    overhead,
    health: healthBadge,
  });

  return execAgent(realBin, parsed.passthrough, childEnv);
}
