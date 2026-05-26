/**
 * `cue router <profile>` — preview the auto-built skill router for a profile.
 * `cue router --audit`   — cross-profile description-quality matrix.
 *
 * Reads each local skill's SKILL.md frontmatter, runs the same parser that
 * the materializer uses, then color-codes the result so weak descriptions
 * are visible at a glance.
 */

import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { listProfiles, loadProfile } from "../lib/profile-loader";
import { parseSkillFromPath, type ParsedSkill } from "../lib/skill-router";

const HERE = dirname(fileURLToPath(import.meta.url));
const FALLBACK_REPO_ROOT = resolvePath(HERE, "..", "..");

/** Resolved at call time so tests can override via env without restarting. */
function skillsRoot(): string {
  const repo = process.env.CUE_REPO_ROOT ?? process.env.SOUL_REPO_ROOT ?? FALLBACK_REPO_ROOT;
  return join(repo, "resources", "skills", "skills");
}

// ---------------------------------------------------------------------------
// Color helpers — respect NO_COLOR and --no-color
// ---------------------------------------------------------------------------

interface Colors {
  green: (s: string) => string;
  yellow: (s: string) => string;
  red: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

function makeColors(useColor: boolean): Colors {
  const wrap = (code: string) =>
    useColor ? (s: string) => `\x1b[${code}m${s}\x1b[0m` : (s: string) => s;
  return {
    green: wrap("32"),
    yellow: wrap("33"),
    red: wrap("31"),
    dim: wrap("2"),
    bold: wrap("1"),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

interface ParsedArgs {
  audit: boolean;
  graph: boolean;
  suggest: boolean;
  profile?: string;
  noColor: boolean;
  out?: string;
  open: boolean;
}

export async function run(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed === "help") {
    printHelp();
    return 0;
  }
  if (typeof parsed === "string") {
    process.stderr.write(`${parsed}\n`);
    printHelp(process.stderr);
    return 1;
  }

  const useColor = !parsed.noColor && process.env.NO_COLOR == null && process.stdout.isTTY === true;
  const colors = makeColors(useColor);

  if (parsed.graph) return await runGraph(parsed.out, parsed.open, colors);
  if (parsed.suggest) return await runSuggest(parsed.profile!, colors);
  if (parsed.audit) return await runAudit(colors);
  return await runPreview(parsed.profile!, colors);
}

// ---------------------------------------------------------------------------
// Preview mode — `cue router <profile>`
// ---------------------------------------------------------------------------

async function runPreview(profileName: string, c: Colors): Promise<number> {
  let resolved;
  try {
    resolved = await loadProfile(profileName);
  } catch (err) {
    process.stderr.write(`cue router: ${(err as Error).message}\n`);
    return 1;
  }

  const localRefs = resolved.skills.local.filter((r) => !r.id.includes("*"));
  if (localRefs.length === 0) {
    process.stdout.write(`Profile "${profileName}" has no local skills to route.\n`);
    return 0;
  }

  const skills: ParsedSkill[] = [];
  for (const ref of localRefs) {
    skills.push(await parseSkillFromPath(ref.id, skillsRoot()));
  }

  const counts = countQuality(skills);
  const totalTriggers = skills.reduce((n, s) => n + s.triggers.length, 0);
  const weakCount = counts.none + counts.partial;

  const icon = (resolved as { icon?: string }).icon ?? "";
  process.stdout.write(`\n${icon ? icon + " " : ""}${c.bold(profileName)} — skill router preview\n`);
  process.stdout.write(c.dim("═".repeat(67)) + "\n\n");

  // Capability table — what Claude reaches for proactively.
  process.stdout.write(c.bold("Capabilities (Claude reaches for these proactively):\n\n"));
  const capRows = buildCapabilityRows(skills);
  if (capRows.length === 0) {
    process.stdout.write(c.dim("  (none — every skill is missing both capability and when_to_invoke)\n\n"));
  } else {
    const maxTask = Math.min(50, Math.max(...capRows.map((r) => r.task.length)));
    for (const row of capRows) {
      const dot = qualityDot(row.quality, c);
      const task = padOrTruncate(row.task, maxTask);
      process.stdout.write(`  ${dot} ${task}  →  ${c.bold(row.skill)}\n`);
    }
    process.stdout.write("\n");
  }

  // Trigger table — reactive routing on user phrases.
  process.stdout.write(c.bold("Trigger phrases (Claude jumps to these on exact-match user input):\n\n"));
  const trigRows = skills.flatMap((s) =>
    s.triggers.slice(0, 6).map((phrase) => ({ phrase, skill: s.name })),
  );
  if (trigRows.length === 0) {
    process.stdout.write(c.dim("  (none — no skills have parseable trigger phrases)\n\n"));
  } else {
    const maxPhrase = Math.min(40, Math.max(...trigRows.map((r) => r.phrase.length + 2)));
    for (const row of trigRows) {
      const quoted = `"${row.phrase}"`;
      const padded = padOrTruncate(quoted, maxPhrase);
      process.stdout.write(`  ${padded}  →  ${c.bold(row.skill)}\n`);
    }
    process.stdout.write("\n");
  }

  // Tail — skills with no router-useful metadata.
  const otherSkills = skills.filter((s) => s.quality === "none");
  if (otherSkills.length > 0) {
    process.stdout.write(c.bold("Skills with weak metadata (W6/W7 — see `cue validate`):\n\n"));
    for (const s of otherSkills) {
      process.stdout.write(`  ${c.red("○")} ${s.id}\n`);
    }
    process.stdout.write("\n");
  }

  // Legend + summary line.
  process.stdout.write(
    c.dim(`Legend  ${c.green("●")} good   ${c.yellow("◐")} partial   ${c.red("○")} none\n\n`),
  );
  process.stdout.write(
    `${skills.length} skills · ${totalTriggers} triggers · ` +
      `${c.green(String(counts.good))} good / ` +
      `${c.yellow(String(counts.partial))} partial / ` +
      `${c.red(String(counts.none))} none` +
      (weakCount > 0 ? `  ${c.dim(`(${weakCount} W6/W7 issues — run \`cue validate ${profileName}\`)`)}` : "") +
      "\n\n",
  );

  return 0;
}

interface CapabilityRow {
  task: string;
  skill: string;
  quality: ParsedSkill["quality"];
}

function buildCapabilityRows(skills: ParsedSkill[]): CapabilityRow[] {
  const rows: CapabilityRow[] = [];
  for (const s of skills) {
    if (s.whenToInvoke.length > 0) {
      for (const task of s.whenToInvoke.slice(0, 3)) {
        rows.push({ task, skill: s.name, quality: s.quality });
      }
    } else if (s.capability) {
      rows.push({ task: s.capability, skill: s.name, quality: s.quality });
    }
  }
  return rows;
}

function qualityDot(quality: ParsedSkill["quality"], c: Colors): string {
  if (quality === "good") return c.green("●");
  if (quality === "partial") return c.yellow("◐");
  return c.red("○");
}

function padOrTruncate(text: string, width: number): string {
  if (text.length === width) return text;
  if (text.length > width) return text.slice(0, width - 1).trimEnd() + "…";
  return text.padEnd(width, " ");
}

// ---------------------------------------------------------------------------
// Audit mode — `cue router --audit`
// ---------------------------------------------------------------------------

interface ProfileAuditRow {
  profile: string;
  total: number;
  good: number;
  partial: number;
  none: number;
}

async function runAudit(c: Colors): Promise<number> {
  const profileNames = await listProfiles();
  if (profileNames.length === 0) {
    process.stdout.write("No profiles found.\n");
    return 0;
  }

  const rows: ProfileAuditRow[] = [];
  const skillProfileCount = new Map<string, { count: number; quality: ParsedSkill["quality"] }>();
  let uniqueSkills = 0;

  for (const name of profileNames) {
    let resolved;
    try {
      resolved = await loadProfile(name);
    } catch {
      continue; // skip broken profiles — `cue validate` covers them
    }
    const localRefs = resolved.skills.local.filter((r) => !r.id.includes("*"));
    if (localRefs.length === 0) continue;

    const parsed = await Promise.all(
      localRefs.map((ref) => parseSkillFromPath(ref.id, skillsRoot())),
    );
    const counts = countQuality(parsed);
    rows.push({
      profile: name,
      total: parsed.length,
      good: counts.good,
      partial: counts.partial,
      none: counts.none,
    });

    for (const s of parsed) {
      if (s.missing) continue;
      const prev = skillProfileCount.get(s.id);
      if (!prev) {
        skillProfileCount.set(s.id, { count: 1, quality: s.quality });
        uniqueSkills++;
      } else {
        prev.count++;
      }
    }
  }

  rows.sort((a, b) => {
    if (b.none !== a.none) return b.none - a.none;
    return b.partial - a.partial;
  });

  const widest = Math.max(...rows.map((r) => r.profile.length), "Profile".length);

  process.stdout.write(
    `\n${c.bold(`cue skill-router health · ${rows.length} profiles · ${uniqueSkills} unique skills`)}\n`,
  );
  process.stdout.write(c.dim("═".repeat(73)) + "\n\n");

  const header =
    "  " +
    "Profile".padEnd(widest) +
    "  skills   " +
    c.green("● good ") +
    "  " +
    c.yellow("◐ partial") +
    "  " +
    c.red("○ none") +
    "  coverage";
  process.stdout.write(header + "\n");
  process.stdout.write(c.dim("  " + "─".repeat(widest + 50)) + "\n");

  for (const row of rows) {
    const coverage = row.total > 0 ? Math.round((row.good * 100) / row.total) : 0;
    const bar = coverageBar(coverage, c);
    process.stdout.write(
      `  ${row.profile.padEnd(widest)}  ${String(row.total).padStart(6)}   ` +
        `${c.green(String(row.good).padStart(6))}    ` +
        `${c.yellow(String(row.partial).padStart(7))}    ` +
        `${c.red(String(row.none).padStart(5))}   ${String(coverage).padStart(3)}%  ${bar}\n`,
    );
  }
  process.stdout.write("\n");

  // Worst-skills leverage list — skills with quality=none that appear in 3+
  // profiles. Fixing one of these lifts every profile that includes it.
  const worst = [...skillProfileCount.entries()]
    .filter(([, v]) => v.quality === "none" && v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  if (worst.length > 0) {
    process.stdout.write(c.bold("High-leverage cleanup (weak skills shared across ≥3 profiles):\n\n"));
    for (const [id, { count }] of worst) {
      process.stdout.write(`  ${c.red("○")} ${id}  ${c.dim(`— used in ${count} profiles`)}\n`);
    }
    process.stdout.write("\n");
    const totalLift = worst.reduce((sum, [, v]) => sum + v.count, 0);
    process.stdout.write(
      c.dim(`Fixing all ${worst.length} would raise +${totalLift} profile-level quality points.\n\n`),
    );
  } else {
    process.stdout.write(c.dim("No high-leverage cleanup targets — no weak skill is shared across ≥3 profiles.\n\n"));
  }

  return 0;
}

function coverageBar(pct: number, c: Colors): string {
  const width = 10;
  const filled = Math.round((pct * width) / 100);
  const empty = width - filled;
  const bar = "▓".repeat(filled) + "░".repeat(empty);
  if (pct >= 75) return c.green(bar);
  if (pct >= 50) return c.yellow(bar);
  return c.red(bar);
}

function countQuality(skills: ParsedSkill[]): { good: number; partial: number; none: number } {
  let good = 0, partial = 0, none = 0;
  for (const s of skills) {
    if (s.quality === "good") good++;
    else if (s.quality === "partial") partial++;
    else none++;
  }
  return { good, partial, none };
}

// ---------------------------------------------------------------------------
// Graph mode — `cue router --graph`
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  label: string;
  kind: "profile" | "skill";
  /** For skill nodes: parser quality. For profile nodes: not set. */
  quality?: ParsedSkill["quality"];
}

interface GraphEdge {
  source: string; // profile id
  target: string; // skill id
}

async function runGraph(outPath: string | undefined, openIt: boolean, c: Colors): Promise<number> {
  const profileNames = await listProfiles();
  const profileNodes: GraphNode[] = [];
  const skillNodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const name of profileNames) {
    let resolved;
    try {
      resolved = await loadProfile(name);
    } catch {
      continue;
    }
    const localRefs = resolved.skills.local.filter((r) => !r.id.includes("*"));
    if (localRefs.length === 0) continue;

    profileNodes.push({ id: `p:${name}`, label: name, kind: "profile" });

    for (const ref of localRefs) {
      const parsed = await parseSkillFromPath(ref.id, skillsRoot());
      if (!skillNodes.has(ref.id)) {
        skillNodes.set(ref.id, {
          id: `s:${ref.id}`,
          label: ref.id.split("/").pop() ?? ref.id,
          kind: "skill",
          quality: parsed.quality,
        });
      }
      edges.push({ source: `p:${name}`, target: `s:${ref.id}` });
    }
  }

  const nodes = [...profileNodes, ...skillNodes.values()];
  const html = renderGraphHtml(nodes, edges);

  const target = outPath ?? join(process.cwd(), "cue-router-graph.html");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(target, html, "utf8");
  process.stdout.write(`${c.bold("Graph written:")} ${target}\n`);
  process.stdout.write(
    `  ${profileNodes.length} profiles · ${skillNodes.size} unique skills · ${edges.length} edges\n`,
  );

  if (openIt) {
    const { spawn } = await import("node:child_process");
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const child = spawn(opener, [target], { detached: true, stdio: "ignore" });
    child.unref();
    process.stdout.write(`  ${c.dim(`opening with ${opener}`)}\n`);
  }
  return 0;
}

function renderGraphHtml(nodes: GraphNode[], edges: GraphEdge[]): string {
  const elements = [
    ...nodes.map((n) => ({
      data: { id: n.id, label: n.label, kind: n.kind, quality: n.quality ?? "" },
    })),
    ...edges.map((e, i) => ({
      data: { id: `e${i}`, source: e.source, target: e.target },
    })),
  ];

  const json = JSON.stringify(elements);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>cue router graph</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0f1419; color: #cdd9e5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
    #cy { width: 100vw; height: 100vh; }
    #legend { position: fixed; top: 12px; left: 12px; padding: 10px 14px; background: rgba(22, 27, 34, 0.95); border: 1px solid #30363d; border-radius: 6px; font-size: 12px; line-height: 1.6; pointer-events: none; }
    #legend strong { display: block; margin-bottom: 4px; color: #f0f6fc; }
    #legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    #stats { position: fixed; bottom: 12px; left: 12px; padding: 8px 12px; background: rgba(22, 27, 34, 0.95); border: 1px solid #30363d; border-radius: 6px; font-size: 11px; }
  </style>
  <script src="https://unpkg.com/cytoscape@3.30.0/dist/cytoscape.min.js"></script>
</head>
<body>
  <div id="legend">
    <strong>cue router graph</strong>
    <div><span class="dot" style="background:#58a6ff"></span> profile</div>
    <div><span class="dot" style="background:#3fb950"></span> skill (good)</div>
    <div><span class="dot" style="background:#d29922"></span> skill (partial)</div>
    <div><span class="dot" style="background:#f85149"></span> skill (none)</div>
  </div>
  <div id="stats">${nodes.filter((n) => n.kind === "profile").length} profiles · ${nodes.filter((n) => n.kind === "skill").length} skills · ${edges.length} edges</div>
  <div id="cy"></div>
  <script>
    const elements = ${json};
    cytoscape({
      container: document.getElementById("cy"),
      elements,
      style: [
        { selector: 'node[kind = "profile"]',
          style: { 'background-color': '#58a6ff', 'label': 'data(label)', 'color': '#f0f6fc', 'font-size': 11, 'width': 28, 'height': 28, 'text-valign': 'bottom', 'text-margin-y': 4 } },
        { selector: 'node[kind = "skill"][quality = "good"]',
          style: { 'background-color': '#3fb950', 'label': 'data(label)', 'color': '#8b949e', 'font-size': 9, 'width': 12, 'height': 12, 'text-valign': 'bottom', 'text-margin-y': 2 } },
        { selector: 'node[kind = "skill"][quality = "partial"]',
          style: { 'background-color': '#d29922', 'label': 'data(label)', 'color': '#8b949e', 'font-size': 9, 'width': 12, 'height': 12, 'text-valign': 'bottom', 'text-margin-y': 2 } },
        { selector: 'node[kind = "skill"][quality = "none"]',
          style: { 'background-color': '#f85149', 'label': 'data(label)', 'color': '#8b949e', 'font-size': 9, 'width': 14, 'height': 14, 'text-valign': 'bottom', 'text-margin-y': 2 } },
        { selector: 'edge',
          style: { 'width': 0.5, 'line-color': '#30363d', 'curve-style': 'haystack', 'haystack-radius': 0.5, 'opacity': 0.6 } },
      ],
      layout: { name: 'cose', idealEdgeLength: 60, nodeRepulsion: 4000, animate: false, randomize: true },
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Suggest mode — `cue router --suggest <profile>`
// ---------------------------------------------------------------------------

async function runSuggest(profileName: string, c: Colors): Promise<number> {
  let resolved;
  try {
    resolved = await loadProfile(profileName);
  } catch (err) {
    process.stderr.write(`cue router: ${(err as Error).message}\n`);
    return 1;
  }

  const localRefs = resolved.skills.local.filter((r) => !r.id.includes("*"));
  const weak: { id: string; skill: ParsedSkill; reason: "W6" | "W7" | "both" }[] = [];

  for (const ref of localRefs) {
    const parsed = await parseSkillFromPath(ref.id, skillsRoot());
    if (parsed.missing) continue;
    const noTriggers = parsed.triggers.length === 0;
    const noCapability = !parsed.capability;
    if (noTriggers && noCapability) {
      weak.push({ id: ref.id, skill: parsed, reason: "both" });
    } else if (noTriggers) {
      weak.push({ id: ref.id, skill: parsed, reason: "W6" });
    } else if (noCapability) {
      weak.push({ id: ref.id, skill: parsed, reason: "W7" });
    }
  }

  if (weak.length === 0) {
    process.stdout.write(
      `${c.green("✓")} ${c.bold(profileName)}: every local skill already has triggers + capability. No W6/W7 cleanup needed.\n`,
    );
    return 0;
  }

  process.stdout.write(
    `\n${c.bold(`Description rewrite suggestions for ${profileName} — ${weak.length} skill(s)`)}\n`,
  );
  process.stdout.write(c.dim("═".repeat(67)) + "\n");
  process.stdout.write(
    c.dim("Templates only — replace placeholders with what the skill actually does, then paste into SKILL.md frontmatter.\n\n"),
  );

  for (const w of weak) {
    process.stdout.write(`${c.bold(w.id)}  ${c.dim(`(${w.reason})`)}\n`);
    if (w.skill.rawDescription) {
      process.stdout.write(`  ${c.dim("current:")}    ${truncateOneLine(w.skill.rawDescription, 100)}\n`);
    } else {
      process.stdout.write(`  ${c.dim("current:")}    ${c.red("(no description field at all)")}\n`);
    }
    process.stdout.write(`  ${c.dim("suggested:")}  ${c.yellow(suggestRewrite(w.skill, w.reason))}\n\n`);
  }

  process.stdout.write(
    c.dim(`Apply manually by editing each \`SKILL.md\` frontmatter. \`cue validate ${profileName}\` re-runs the linter.\n\n`),
  );
  return 0;
}

function suggestRewrite(skill: ParsedSkill, reason: "W6" | "W7" | "both"): string {
  const name = skill.name;
  const verb = guessVerb(skill);
  const noun = guessNoun(skill);

  if (reason === "both") {
    return `Use when user says "${verb} ${noun}", "${verb} the ${noun}", or "${noun}". ${capitalize(verb)}s ${noun} via ${name}. NOT for <unrelated case>.`;
  }
  if (reason === "W6") {
    // Has capability prose — just add triggers
    return `Use when user says "${verb} ${noun}", "${verb} the ${noun}", or "${noun}". ${truncateOneLine(skill.capability, 80)}`;
  }
  // W7 — has triggers, missing capability
  const triggerHint = skill.triggers.slice(0, 3).map((t) => `"${t}"`).join(", ");
  return `Use when user says ${triggerHint}. ${capitalize(verb)}s ${noun} via ${name}. Beats freestyling because <house-style rule or backend enhancement>.`;
}

function guessVerb(skill: ParsedSkill): string {
  // From rawDescription, look for first imperative verb (very rough)
  const candidates = ["generate", "create", "build", "run", "review", "lint", "scan", "deploy", "summarize", "extract", "format", "render", "fetch", "import", "export"];
  const lower = (skill.rawDescription + " " + skill.name).toLowerCase();
  for (const v of candidates) if (lower.includes(v)) return v;
  return "do";
}

function guessNoun(skill: ParsedSkill): string {
  // Strip the verb-y bits from the skill name and use the remainder
  const parts = skill.name.split(/[-_]/).filter((p) => p.length > 2);
  if (parts.length > 0) return parts[parts.length - 1]!;
  return "<thing>";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function truncateOneLine(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Argv parsing + help
// ---------------------------------------------------------------------------

function parseArgs(args: string[]): ParsedArgs | "help" | string {
  if (args.includes("-h") || args.includes("--help")) return "help";

  const audit = args.includes("--audit");
  const graph = args.includes("--graph");
  const suggest = args.includes("--suggest");
  const noColor = args.includes("--no-color");
  const open = args.includes("--open");

  // --out <path>
  let out: string | undefined;
  const outIdx = args.indexOf("--out");
  if (outIdx >= 0 && outIdx < args.length - 1) {
    out = args[outIdx + 1];
  }

  // strip flag values from positional list
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("-")) continue;
    if (i > 0 && args[i - 1] === "--out") continue; // consumed
    positional.push(a);
  }

  // Mode validation
  const modeCount = (audit ? 1 : 0) + (graph ? 1 : 0) + (suggest ? 1 : 0);
  if (modeCount > 1) {
    return "cue router: pick one of --audit / --graph / --suggest";
  }
  if (audit && positional.length > 0) {
    return "cue router: --audit takes no <profile>";
  }
  if (graph && positional.length > 0) {
    return "cue router: --graph runs across every profile; no <profile> arg";
  }
  if (suggest && positional.length !== 1) {
    return "cue router --suggest: expected exactly one <profile>";
  }
  if (!audit && !graph && !suggest && positional.length !== 1) {
    return "cue router: expected <profile> or one of --audit / --graph / --suggest";
  }

  return {
    audit, graph, suggest,
    profile: positional[0],
    noColor, out, open,
  };
}

function printHelp(stream: Pick<NodeJS.WriteStream, "write"> = process.stdout): void {
  stream.write(
    [
      "Usage:",
      "  cue router <profile>            preview the auto-built router for a profile",
      "  cue router --audit              cross-profile description-quality matrix",
      "  cue router --graph              render an HTML force-graph of profiles ↔ skills",
      "  cue router --suggest <profile>  print rewrite templates for weak skill descriptions",
      "",
      "Flags:",
      "  --no-color    disable color output (also honored: NO_COLOR env)",
      "  --out PATH    --graph output file (default ./cue-router-graph.html)",
      "  --open        --graph also opens the file in your default browser",
      "  -h, --help    show this help",
      "",
      "What it shows:",
      "  • Capabilities — what Claude reaches for proactively during reasoning",
      "  • Trigger phrases — what Claude jumps to on exact user-input match",
      "  • Quality marks — ● good, ◐ partial, ○ none (linter W6/W7 punch list)",
      "",
      "Without `cue router`, you'd only see this by materializing and reading",
      "the generated CLAUDE.md — this preview short-circuits that loop.",
      "",
    ].join("\n"),
  );
}
