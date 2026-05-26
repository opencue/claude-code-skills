/**
 * `cue lint-skill <path> [--fix] [--json] [--pr-body --repo <owner/name>]`
 *
 * Lints a SKILL.md (or every SKILL.md under a directory) against the cue
 * skill spec. With --fix, writes corrections back. With --pr-body, prints
 * the markdown body cue would post if it opened a PR for this skill.
 */

import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute, relative } from "node:path";

import { homedir } from "node:os";

import {
  lint,
  applyFixes,
  applyBaseline,
  buildBaseline,
  buildPrBody,
  checkZombie,
  findOverlap,
  scoreDiagnostics,
  type Diagnostic,
  type LintBaseline,
  type OverlapCorpusEntry,
} from "../lib/skill-linter";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const sevColor: Record<string, (s: string) => string> = {
  error: red, warning: yellow, info: dim,
};

/** Return every SKILL.md beneath a path. If `path` is a file, returns [path]. */
function collectSkillFiles(path: string): string[] {
  const abs = isAbsolute(path) ? path : resolve(path);
  if (!existsSync(abs)) return [];
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  // Directory — walk one level deep first (most repos have skills/foo/SKILL.md)
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e);
      try {
        const s = statSync(full);
        if (s.isDirectory()) walk(full, depth + 1);
        else if (e === "SKILL.md" || e === "skill.md") out.push(full);
      } catch {}
    }
  };
  walk(abs, 0);
  return out;
}

interface FileReport {
  path: string;
  diagnostics: Diagnostic[];
  fixed?: string[];   // rules whose fix was applied
  score: number;
}

function scoreColor(s: number): (str: string) => string {
  if (s >= 90) return green;
  if (s >= 70) return yellow;
  return red;
}

function renderReport(reports: FileReport[]): void {
  let totalErr = 0, totalWarn = 0, totalInfo = 0, totalFixed = 0;
  for (const r of reports) {
    const scoreTag = scoreColor(r.score)(`${r.score}/100`);
    if (r.diagnostics.length === 0 && (!r.fixed || r.fixed.length === 0)) {
      process.stdout.write(`  ${green("✓")} ${r.path} ${dim("(clean)")} ${scoreTag}\n`);
      continue;
    }
    process.stdout.write(`\n  ${bold(r.path)}  ${scoreTag}\n`);
    if (r.fixed && r.fixed.length > 0) {
      process.stdout.write(`    ${green(`✓ Applied ${r.fixed.length} fix(es): ${r.fixed.join(", ")}`)}\n`);
      totalFixed += r.fixed.length;
    }
    for (const d of r.diagnostics) {
      const col = sevColor[d.severity] ?? dim;
      const tag = col(`${d.severity.toUpperCase().padEnd(7)} ${d.rule}`);
      const fixable = d.fix ? dim(" (fixable with --fix)") : "";
      process.stdout.write(`    ${tag}  ${d.message}${fixable}\n`);
      if (d.severity === "error") totalErr++;
      else if (d.severity === "warning") totalWarn++;
      else totalInfo++;
    }
  }
  // Worst-skills ranking when linting more than one file.
  if (reports.length > 1) {
    const ranked = [...reports].sort((a, b) => a.score - b.score).slice(0, 5);
    process.stdout.write(`\n  ${bold("Weakest skills")} (lowest score first):\n`);
    for (const r of ranked) {
      process.stdout.write(`    ${scoreColor(r.score)(`${r.score}/100`)}  ${r.path}\n`);
    }
  }
  process.stdout.write(`\n  ${bold("Summary")}: ${red(`${totalErr} error`)}, ${yellow(`${totalWarn} warning`)}, ${dim(`${totalInfo} info`)}`);
  if (totalFixed > 0) process.stdout.write(`, ${green(`${totalFixed} auto-fixed`)}`);
  process.stdout.write("\n\n");
}

function loadBaseline(path: string): LintBaseline | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as LintBaseline;
    if (parsed.version !== 1 || typeof parsed.files !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function run(args: string[]): Promise<number> {
  const asJson = args.includes("--json");
  const doFix = args.includes("--fix");
  const prBody = args.includes("--pr-body");
  const repoIdx = args.indexOf("--repo");
  const repo = repoIdx >= 0 ? args[repoIdx + 1] : undefined;
  const baselineIdx = args.indexOf("--baseline");
  const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : undefined;
  const baselineWriteIdx = args.indexOf("--baseline-write");
  const baselineWritePath = baselineWriteIdx >= 0 ? args[baselineWriteIdx + 1] : undefined;
  const overlapIdx = args.indexOf("--check-overlap");
  const checkOverlap = overlapIdx >= 0;
  const corpusRoot = checkOverlap ? args[overlapIdx + 1] : undefined;
  const zombieIdx = args.indexOf("--check-zombie");
  const checkZombieFlag = zombieIdx >= 0;
  const zombieAnalyticsArg = checkZombieFlag ? args[zombieIdx + 1] : undefined;
  const zombieAnalyticsPath = checkZombieFlag
    ? (zombieAnalyticsArg && !zombieAnalyticsArg.startsWith("-")
        ? (isAbsolute(zombieAnalyticsArg) ? zombieAnalyticsArg : resolve(process.cwd(), zombieAnalyticsArg))
        : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "cue", "analytics.jsonl"))
    : undefined;
  const zombieWindowIdx = args.indexOf("--zombie-window");
  const zombieWindowDays = zombieWindowIdx >= 0 ? parseInt(args[zombieWindowIdx + 1] ?? "30", 10) : 30;

  const valueFlags = new Set(["--repo", "--baseline", "--baseline-write", "--check-overlap", "--check-zombie", "--zombie-window"]);
  const positional = args.filter((a, i) => !a.startsWith("-") && !valueFlags.has(args[i - 1] ?? ""));

  if (positional.length === 0) {
    process.stderr.write("Usage: cue lint-skill <path> [--fix] [--json] [--pr-body --repo owner/name] [--baseline path] [--baseline-write path]\n");
    return 1;
  }

  // Collect files
  const files: string[] = [];
  for (const p of positional) files.push(...collectSkillFiles(p));
  if (files.length === 0) {
    process.stderr.write(`No SKILL.md (or skill.md) found under: ${positional.join(", ")}\n`);
    return 1;
  }

  const baseline = baselinePath ? loadBaseline(baselinePath) : null;
  if (baselinePath && !baseline) {
    process.stderr.write(`baseline file not found or invalid: ${baselinePath}\n`);
  }
  const cwd = process.cwd();
  const toRelPath = (abs: string) => relative(cwd, abs) || abs;

  // R012 overlap requires a corpus of OTHER skills. If --check-overlap was
  // passed (with or without an explicit root), discover every SKILL.md under
  // the given root (default: resources/skills/skills relative to cwd).
  let corpus: OverlapCorpusEntry[] = [];
  if (checkOverlap) {
    const root = corpusRoot && !corpusRoot.startsWith("-")
      ? (isAbsolute(corpusRoot) ? corpusRoot : resolve(cwd, corpusRoot))
      : resolve(cwd, "resources/skills/skills");
    const corpusPaths = collectSkillFiles(root);
    for (const p of corpusPaths) {
      try { corpus.push({ path: toRelPath(p), content: readFileSync(p, "utf8") }); } catch { /* skip */ }
    }
  }

  const reports: FileReport[] = [];
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const rel = toRelPath(file);
    const overlapDiags = checkOverlap ? findOverlap(rel, before, corpus) : [];
    const zombieDiags = checkZombieFlag && zombieAnalyticsPath
      ? checkZombie(before, { analyticsPath: zombieAnalyticsPath, windowDays: zombieWindowDays })
      : [];
    if (doFix) {
      const { fixed, applied } = applyFixes(before);
      if (fixed !== before) writeFileSync(file, fixed);
      const { diagnostics } = lint(fixed); // re-lint after fix to show remaining
      const combined = [...diagnostics, ...overlapDiags, ...zombieDiags];
      const filtered = applyBaseline(rel, combined, baseline);
      reports.push({ path: file, diagnostics: filtered, fixed: applied, score: scoreDiagnostics(filtered) });
    } else {
      const { diagnostics } = lint(before);
      const combined = [...diagnostics, ...overlapDiags, ...zombieDiags];
      const filtered = applyBaseline(rel, combined, baseline);
      reports.push({ path: file, diagnostics: filtered, score: scoreDiagnostics(filtered) });
    }
  }

  // --baseline-write: snapshot current diagnostics and write the baseline,
  // then exit 0 without normal reporting.
  if (baselineWritePath) {
    const snap = buildBaseline(reports.map((r) => ({
      path: toRelPath(r.path),
      diagnostics: r.diagnostics,
    })));
    writeFileSync(baselineWritePath, JSON.stringify(snap, null, 2) + "\n");
    process.stdout.write(`Wrote baseline (${Object.keys(snap.files).length} file(s)) to ${baselineWritePath}\n`);
    return 0;
  }

  // --pr-body: requires --repo, single-file mode
  if (prBody) {
    if (!repo) {
      process.stderr.write("--pr-body requires --repo <owner/name>\n");
      return 1;
    }
    if (files.length !== 1) {
      process.stderr.write("--pr-body works on a single SKILL.md file (got " + files.length + ")\n");
      return 1;
    }
    const before = readFileSync(files[0]!, "utf8");
    const { fixed, applied } = applyFixes(before);
    const { diagnostics: leftover } = lint(fixed);
    const fixedDiags = lint(before).diagnostics.filter((d) => applied.includes(d.rule));
    const { title, body } = buildPrBody({
      repo,
      files: [{ path: files[0]!, before, after: fixed, fixedRules: [...new Set(applied)] }],
      diagnosticsFixed: fixedDiags,
      diagnosticsLeft: leftover,
    });
    if (asJson) {
      process.stdout.write(JSON.stringify({ title, body, diff: fixed !== before }, null, 2) + "\n");
    } else {
      process.stdout.write(`${bold("PR title:")} ${title}\n\n${bold("PR body:")}\n\n${body}\n`);
    }
    return 0;
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(reports.map((r) => ({
      path: r.path,
      score: r.score,
      fixed: r.fixed ?? [],
      diagnostics: r.diagnostics.map((d) => ({ rule: d.rule, severity: d.severity, message: d.message, fixable: !!d.fix })),
    })), null, 2) + "\n");
    return 0;
  }

  renderReport(reports);
  const anyError = reports.some((r) => r.diagnostics.some((d) => d.severity === "error"));
  return anyError ? 1 : 0;
}
