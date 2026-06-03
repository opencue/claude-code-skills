/**
 * Extract the external CLI tools a skill depends on, for the studio's "CLIs"
 * tab. The high-fidelity signal is a SKILL.md's frontmatter `allowed-tools:`
 * list — `Bash(<tool>:*)` entries name exactly what the skill shells out to.
 * We parse those, drop shell builtins / coreutils / Claude's own tool names,
 * and enrich each surviving tool with an install hint from
 * `resources/cli-recipes.json` when one exists.
 *
 * Paths resolve per-call from env so tests can point CUE_REPO_ROOT at a
 * fixture without touching the real recipes file.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function repoRoot(): string {
  return (
    process.env.CUE_REPO_ROOT ??
    process.env.SOUL_REPO_ROOT ??
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
  );
}
function recipesPath(): string {
  return join(repoRoot(), "resources", "cli-recipes.json");
}

export interface ProfileCli {
  /** Tool name as declared in `Bash(<name>…)`. */
  name: string;
  /** Best-effort install command from cli-recipes.json, or "" if no recipe. */
  install: string;
  /** True when cli-recipes.json has a recipe for this tool. */
  known: boolean;
  /** Skill ids (e.g. "rust/cargo-nextest") that declare this CLI. */
  usedBy: string[];
}

// Not external CLIs: Claude's own tool names + shell builtins / coreutils that
// every box already has. Dropping these keeps the tab to real dependencies.
const NON_CLI = new Set([
  "-", "bash", "read", "write", "edit", "multiedit", "notebookedit", "glob",
  "grep", "task", "webfetch", "websearch", "todowrite", "ls", "cat", "head",
  "tail", "find", "echo", "cd", "mkdir", "rmdir", "rm", "cp", "mv", "sed",
  "awk", "sort", "uniq", "wc", "cut", "tr", "xargs", "test", "sleep", "env",
  "export", "source", "pwd", "touch", "chmod", "chown", "dirname", "basename",
  "true", "false", "set", "printf", "tee", "comm", "diff", "date", "seq",
  "tput", "which", "type", "eval", "exit", "return", "local", "for", "while",
  "if", "then", "fi", "do", "done", "case", "esac",
]);

/** Split a SKILL.md into its frontmatter block and body. */
function splitFrontmatter(content: string): { front: string; body: string } {
  const lines = content.split("\n");
  if (lines[0] !== "---") return { front: "", body: content };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return { front: lines.slice(1, i).join("\n"), body: lines.slice(i + 1).join("\n") };
  }
  return { front: "", body: content };
}

/** Source A — `Bash(<tool>…)` refs in the `allowed-tools:` frontmatter. */
function clisFromFrontmatter(front: string, out: Map<string, string>): void {
  const re = /Bash\(\s*([^):*\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(front)) !== null) {
    const raw = m[1]!.trim();
    const key = raw.toLowerCase();
    if (!raw || NON_CLI.has(key)) continue;
    if (!out.has(key)) out.set(key, raw);
  }
}

/** Pull the `## Prerequisites` section body, or "" if the skill has none. */
function prerequisitesSection(body: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s+Prerequisites\b/i.test(l));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i]!)) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** Source B — backticked tool names in `## Prerequisites`, recipe-bounded. */
function clisFromPrerequisites(body: string, out: Map<string, string>): void {
  const section = prerequisitesSection(body);
  if (!section) return;
  const re = /`([a-zA-Z][a-zA-Z0-9._-]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    const raw = m[1]!.trim();
    const key = raw.toLowerCase();
    if (NON_CLI.has(key)) continue;
    // Precision gate: only accept Prerequisites tokens that are real recipes.
    if (!hasRecipe(raw)) continue;
    if (!out.has(key)) out.set(key, raw);
  }
}

let bodyScanCache: { root: string; re: RegExp | null } | null = null;
/**
 * A single command-position regex over all recipe keys, longest-first so
 * `cargo-nextest` wins over `cargo`. "Command position" = start of line, or
 * right after a backtick / `$` / pipe / `>` (optionally a `$ ` prompt). This
 * keeps prose mentions ("use cargo wisely") out while catching real command
 * usage ("`cargo nextest`", "$ nmap -sV").
 */
function bodyScanRegex(): RegExp | null {
  const root = repoRoot();
  if (bodyScanCache && bodyScanCache.root === root) return bodyScanCache.re;
  const keys = Object.keys(loadRecipes()).sort((a, b) => b.length - a.length);
  const re = keys.length
    ? new RegExp(`(?:^|[\\n\`$|>])[ \\t]*(?:\\$[ \\t]*)?(${keys.map(escapeRe).join("|")})(?![\\w-])`, "gm")
    : null;
  bodyScanCache = { root, re };
  return re;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Concatenate only the code spans of a markdown body — fenced blocks (``` or
 * ~~~) and inline `code` — each on its own line. Restricting the body scan to
 * code keeps English-ambiguous recipe keys (`just`, `cross`, `uv`) from
 * matching prose: a tool in code is a command, a word in a sentence is not.
 */
function codeRegions(body: string): string {
  const out: string[] = [];
  const fence = /(?:```|~~~)[^\n]*\n([\s\S]*?)(?:```|~~~)/g;
  let m: RegExpExecArray | null;
  let stripped = body;
  while ((m = fence.exec(body)) !== null) out.push(m[1]!);
  // Remove fenced blocks before scanning inline code so their backticks don't
  // confuse the inline matcher.
  stripped = body.replace(fence, "\n");
  const inline = /`([^`\n]+)`/g;
  while ((m = inline.exec(stripped)) !== null) out.push(m[1]!);
  return out.join("\n");
}

/** Source C — recipe-key tools used in command position inside code spans. */
function clisFromBody(body: string, out: Map<string, string>): void {
  const re = bodyScanRegex();
  if (!re) return;
  const code = codeRegions(body);
  if (!code) return;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const raw = m[1]!;
    const key = raw.toLowerCase();
    if (NON_CLI.has(key)) continue;
    if (!out.has(key)) out.set(key, raw);
  }
}

/**
 * CLI tools a skill depends on, merged from three sources, deduped (first-seen
 * casing preserved), minus shell builtins / Claude tools:
 *  A. frontmatter `allowed-tools: Bash(<tool>…)` — explicit, any tool.
 *  B. `## Prerequisites` backticked tools — recipe-bounded for precision.
 *  C. command-position mentions of cli-recipes.json tools in the body.
 */
export function extractClisFromContent(content: string): string[] {
  const { front, body } = splitFrontmatter(content);
  const out = new Map<string, string>();
  clisFromFrontmatter(front, out);
  clisFromPrerequisites(body, out);
  clisFromBody(body, out);
  return [...out.values()];
}

let recipesCache: { root: string; recipes: Record<string, Record<string, string>> } | null = null;
function loadRecipes(): Record<string, Record<string, string>> {
  const root = repoRoot();
  if (recipesCache && recipesCache.root === root) return recipesCache.recipes;
  let recipes: Record<string, Record<string, string>> = {};
  try {
    const raw = JSON.parse(readFileSync(recipesPath(), "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("$")) continue; // skip $schema-comment
      if (v && typeof v === "object") recipes[k] = v as Record<string, string>;
    }
  } catch {
    recipes = {};
  }
  recipesCache = { root, recipes };
  return recipes;
}

/** Best-effort one-line install command for a CLI, or "" when unknown. */
export function cliInstallHint(name: string): string {
  const r = loadRecipes()[name];
  if (!r) return "";
  if (r.apt) return `apt install ${r.apt}`;
  if (r.brew) return `brew install ${r.brew}`;
  if (r.pacman) return `pacman -S ${r.pacman}`;
  if (r.dnf) return `dnf install ${r.dnf}`;
  if (r.pipx) return `pipx install ${r.pipx}`;
  if (r.pip) return `pip install ${r.pip}`;
  if (r.npm) return `npm i -g ${r.npm}`;
  if (r.script) return r.script;
  if (r.manual) return r.manual;
  return "";
}

/** True when cli-recipes.json has a recipe for this tool. */
export function hasRecipe(name: string): boolean {
  return Boolean(loadRecipes()[name]);
}

/**
 * Aggregate the CLIs across a set of skills into a per-profile list, ranked by
 * how many skills use each (then alphabetical). `skills` carries each skill's
 * id + full SKILL.md body (already loaded by the caller).
 */
export function aggregateProfileClis(skills: { id: string; body: string; missing?: boolean }[]): ProfileCli[] {
  const map = new Map<string, string[]>();
  for (const s of skills) {
    if (s.missing) continue;
    for (const cli of extractClisFromContent(s.body)) {
      if (!map.has(cli)) map.set(cli, []);
      map.get(cli)!.push(s.id);
    }
  }
  return [...map.entries()]
    .map(([name, usedBy]) => ({ name, install: cliInstallHint(name), known: hasRecipe(name), usedBy }))
    .sort((a, b) => b.usedBy.length - a.usedBy.length || a.name.localeCompare(b.name));
}
