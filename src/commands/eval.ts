/**
 * `cue eval [profile] [--breakdown] [--compare a b] [--json]`
 *
 * Measures the per-message token overhead a profile drops into context.
 * Counts skills, rules, commands, and hooks (not just skills) so the number
 * matches what actually shows up in CLAUDE.md + tool descriptions.
 */

import { resolve, join, dirname, basename, isAbsolute } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { loadProfile } from "../lib/profile-loader";
import { resolveProfileForCwd } from "../lib/cwd-resolver";
import { computeStats } from "../lib/analytics";
import type { ResolvedProfile } from "../../profiles/_types";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS_ROOT = join(REPO_ROOT, "resources", "skills", "skills");
const RULES_ROOT = join(REPO_ROOT, "resources", "rules");
const COMMANDS_ROOT = join(REPO_ROOT, "resources", "commands");
const HOOKS_ROOT = join(REPO_ROOT, "resources", "hooks");

interface Breakdown {
  skills: number;
  rules: number;
  commands: number;
  hooks: number;
  total: number;
}

function tokensOfFile(path: string): number {
  try { return Math.ceil(readFileSync(path, "utf8").length / 4); } catch { return 0; }
}

function resolveRef(ref: string, base: string, addExt: boolean): string {
  const withExt = addExt && !ref.endsWith(".md") ? `${ref}.md` : ref;
  return isAbsolute(withExt) ? withExt : join(base, withExt);
}

function computeBreakdown(p: ResolvedProfile): Breakdown {
  let skills = 0;
  for (const s of p.skills.local) {
    if (s.id.includes("*")) continue;
    skills += tokensOfFile(join(SKILLS_ROOT, s.id, "SKILL.md"));
  }
  let rules = 0;
  for (const r of p.rules) rules += tokensOfFile(resolveRef(r, RULES_ROOT, true));
  let commands = 0;
  for (const c of p.commands) commands += tokensOfFile(resolveRef(c, COMMANDS_ROOT, true));
  let hooks = 0;
  for (const h of p.hooks) hooks += tokensOfFile(resolveRef(h, HOOKS_ROOT, false));
  return { skills, rules, commands, hooks, total: skills + rules + commands + hooks };
}

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function fmtK(n: number): string { return `${(n / 1000).toFixed(1)}K`; }
function cost(n: number): string { return `$${((n / 1000) * 0.003).toFixed(4)}`; }

function scoreOf(p: ResolvedProfile, b: Breakdown, fullTotal: number, sessions: number): number {
  const savings = fullTotal > 0 ? Math.max(0, Math.round((1 - b.total / fullTotal) * 100)) : 0;
  return Math.min(100, Math.round(
    (savings * 0.4) +
    (Math.min(sessions, 20) / 20 * 30) +
    (p.mcps.length > 0 ? 15 : 0) +
    (p.plugins.length > 0 ? 15 : 0)
  ));
}

function grade(score: number): { letter: string; color: (s: string) => string } {
  if (score >= 90) return { letter: "A", color: green };
  if (score >= 75) return { letter: "B", color: green };
  if (score >= 60) return { letter: "C", color: yellow };
  if (score >= 40) return { letter: "D", color: yellow };
  return { letter: "F", color: red };
}

async function fullProfileTotal(): Promise<number> {
  try {
    const full = await loadProfile("full");
    return computeBreakdown(full).total;
  } catch { return 0; }
}

function sessionsFor(name: string): number {
  return computeStats().find((s) => s.profile === name)?.sessions ?? 0;
}

async function renderOne(name: string, showBreakdown: boolean, asJson: boolean): Promise<number> {
  const profile = await loadProfile(name);
  const b = computeBreakdown(profile);
  const sessions = sessionsFor(name);
  const fullTotal = await fullProfileTotal();
  const savings = fullTotal > 0 ? Math.max(0, Math.round((1 - b.total / fullTotal) * 100)) : 0;
  const score = scoreOf(profile, b, fullTotal, sessions);
  const g = grade(score);

  if (asJson) {
    process.stdout.write(JSON.stringify({
      profile: name,
      counts: {
        skills: profile.skills.local.length + profile.skills.npx.length,
        rules: profile.rules.length,
        commands: profile.commands.length,
        hooks: profile.hooks.length,
        mcps: profile.mcps.length,
        plugins: profile.plugins.length,
      },
      tokens: b,
      fullTokens: fullTotal,
      savingsPct: savings,
      costPerMessage: cost(b.total),
      sessions,
      score,
      grade: g.letter,
    }, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`\n  ${bold("Profile Eval:")} ${name}\n\n`);
  process.stdout.write(`  ${bold("Loadout")}\n`);
  process.stdout.write(`    Skills: ${profile.skills.local.length}  Rules: ${profile.rules.length}  Commands: ${profile.commands.length}  Hooks: ${profile.hooks.length}  MCPs: ${profile.mcps.length}  Plugins: ${profile.plugins.length}\n`);
  process.stdout.write(`    Token overhead: ${fmtK(b.total)}  (${cost(b.total)}/msg)\n\n`);

  if (showBreakdown) {
    process.stdout.write(`  ${bold("Breakdown")}\n`);
    const rows: [string, number][] = [
      ["skills",   b.skills],
      ["rules",    b.rules],
      ["commands", b.commands],
      ["hooks",    b.hooks],
    ];
    const max = Math.max(1, ...rows.map(([, v]) => v));
    for (const [label, val] of rows) {
      const pct = b.total > 0 ? Math.round((val / b.total) * 100) : 0;
      const bar = "█".repeat(Math.round((val / max) * 20));
      process.stdout.write(`    ${label.padEnd(9)} ${fmtK(val).padStart(6)}  ${dim(`${pct}%`)}  ${bar}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(`  ${bold("Efficiency vs full")}\n`);
  process.stdout.write(`    This: ${fmtK(b.total)}    Full: ${fmtK(fullTotal)}    ${green(`Savings: ${savings}%`)}\n\n`);

  process.stdout.write(`  ${bold("Usage")}  Sessions: ${sessions}\n`);
  process.stdout.write(`\n  ${bold("Score:")} ${g.color(`${score}/100 (${g.letter})`)}\n`);
  process.stdout.write(`  ${dim("40% savings + 30% usage + 15% MCPs + 15% plugins")}\n\n`);
  return 0;
}

async function renderCompare(a: string, b: string, asJson: boolean): Promise<number> {
  const [pa, pb] = await Promise.all([loadProfile(a), loadProfile(b)]);
  const [ba, bb] = [computeBreakdown(pa), computeBreakdown(pb)];
  const fullTotal = await fullProfileTotal();
  const [sa, sb] = [sessionsFor(a), sessionsFor(b)];
  const [scA, scB] = [scoreOf(pa, ba, fullTotal, sa), scoreOf(pb, bb, fullTotal, sb)];

  if (asJson) {
    process.stdout.write(JSON.stringify({
      a: { profile: a, tokens: ba, sessions: sa, score: scA },
      b: { profile: b, tokens: bb, sessions: sb, score: scB },
      delta: { total: bb.total - ba.total, score: scB - scA },
    }, null, 2) + "\n");
    return 0;
  }

  const fmtRow = (label: string, va: string, vb: string) =>
    `    ${label.padEnd(12)} ${va.padStart(10)}    ${vb.padStart(10)}\n`;

  process.stdout.write(`\n  ${bold("Compare:")} ${a}  vs  ${b}\n\n`);
  process.stdout.write(`    ${"".padEnd(12)} ${a.padStart(10)}    ${b.padStart(10)}\n`);
  process.stdout.write(`    ${"".padEnd(12)} ${"-".repeat(10)}    ${"-".repeat(10)}\n`);
  process.stdout.write(fmtRow("skills",   String(pa.skills.local.length), String(pb.skills.local.length)));
  process.stdout.write(fmtRow("rules",    String(pa.rules.length),         String(pb.rules.length)));
  process.stdout.write(fmtRow("commands", String(pa.commands.length),      String(pb.commands.length)));
  process.stdout.write(fmtRow("hooks",    String(pa.hooks.length),         String(pb.hooks.length)));
  process.stdout.write(fmtRow("mcps",     String(pa.mcps.length),          String(pb.mcps.length)));
  process.stdout.write(fmtRow("tokens",   fmtK(ba.total),                  fmtK(bb.total)));
  process.stdout.write(fmtRow("cost/msg", cost(ba.total),                  cost(bb.total)));
  process.stdout.write(fmtRow("sessions", String(sa),                      String(sb)));
  const ga = grade(scA), gb = grade(scB);
  process.stdout.write(fmtRow("score",    ga.color(`${scA} (${ga.letter})`), gb.color(`${scB} (${gb.letter})`)));
  const tokenDelta = bb.total - ba.total;
  const arrow = tokenDelta > 0 ? red(`+${fmtK(tokenDelta)}`) : tokenDelta < 0 ? green(`-${fmtK(-tokenDelta)}`) : dim("0");
  process.stdout.write(`\n  ${dim(`${b} uses ${arrow} tokens vs ${a}`)}\n\n`);
  return 0;
}

export async function run(args: string[]): Promise<number> {
  const asJson = args.includes("--json");
  const breakdown = args.includes("--breakdown");
  const compareIdx = args.indexOf("--compare");
  const positional = args.filter((a) => !a.startsWith("-"));

  if (compareIdx >= 0) {
    const a = args[compareIdx + 1];
    const b = args[compareIdx + 2];
    if (!a || !b || a.startsWith("-") || b.startsWith("-")) {
      process.stderr.write("Usage: cue eval --compare <profile-a> <profile-b>\n");
      return 1;
    }
    return renderCompare(a, b, asJson);
  }

  let profileName = positional[0];
  if (!profileName) {
    try {
      const resolved = await resolveProfileForCwd({ cwd: process.cwd(), homeDir: homedir(), configDir: join(homedir(), ".config", "cue") });
      if (resolved.source !== "none") profileName = (resolved as any).profile;
    } catch {}
  }
  if (!profileName) {
    process.stderr.write("Usage: cue eval [profile] [--breakdown] [--compare a b] [--json]\n");
    return 1;
  }
  return renderOne(profileName, breakdown, asJson);
}
