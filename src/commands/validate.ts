/**
 * `cue validate <profile>` — schema, resolver dry-runs, and lint checks.
 */

import {
  hasLintErrors,
  lintAllProfiles,
  lintProfile,
  PROFILE_LINT_RULES,
  type ProfileLintIssue,
  type ProfileLintResult,
} from "../lib/profile-linter";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

interface ParsedArgs {
  all: boolean;
  profile?: string;
  online: boolean;
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

  // Offline by default: the npx fetchability check otherwise does one network
  // `npx skills add` spawn per skill (thousands across --all, no cache), which
  // hangs for minutes. `--online` opts back into the real fetch. An explicit
  // CUE_OFFLINE=1 always wins (enforced inside the linter).
  const lintOpts = { npxOffline: !parsed.online };
  const results = parsed.all
    ? await lintAllProfiles(lintOpts)
    : [await lintProfile(parsed.profile!, lintOpts)];

  if (parsed.all && results.length === 0) {
    process.stdout.write("No profiles found in profiles/.\n");
    return 0;
  }

  for (let i = 0; i < results.length; i++) {
    if (i > 0) process.stdout.write("\n");
    printResult(results[i]!);
  }

  return results.some(hasLintErrors) ? 1 : 0;
}

function parseArgs(args: string[]): ParsedArgs | "help" | string {
  if (args.length === 0) return "cue validate: missing <profile> or --all";
  if (args.includes("-h") || args.includes("--help")) return "help";

  const all = args.includes("--all");
  const online = args.includes("--online") || args.includes("--no-offline");
  const positional = args.filter((arg) => !arg.startsWith("-"));

  if (all && positional.length > 0) {
    return "cue validate: use either --all or <profile>, not both";
  }
  if (all) return { all: true, online };
  if (positional.length !== 1) {
    return "cue validate: expected exactly one <profile>";
  }
  return { all: false, profile: positional[0], online };
}

function printHelp(stream: Pick<NodeJS.WriteStream, "write"> = process.stdout): void {
  stream.write(
    [
      "Usage:",
      "  cue validate <profile>",
      "  cue validate --all",
      "",
      "Checks:",
      "  schema validity, inheritance, local/npx/plugin skill resolution, MCP registry resolution",
      "  W1-W5 warnings and E1-E3 lint errors",
      "",
      "Options:",
      "  --online   Fetch uncached npx skills over the network (one `npx skills add`",
      "             per skill). Default is offline: uncached npx skills are reported",
      "             as 'not cached', not errors — keeps `--all` fast and hang-free.",
      "",
    ].join("\n"),
  );
}

function printResult(result: ProfileLintResult): void {
  const title = `Profile: ${result.profileName}`;
  process.stdout.write(`${title}\n`);

  for (const check of result.checks) {
    process.stdout.write(
      `  ${color(GREEN, "\u2713")} ${check.name}: ${check.message}\n`,
    );
  }

  const warnings = result.issues.filter((issue) => issue.severity === "warning");
  const errors = result.issues.filter((issue) => issue.severity === "error");

  for (const warning of warnings) {
    printIssue(warning);
  }
  for (const error of errors) {
    printIssue(error);
  }

  if (result.issues.length === 0) {
    process.stdout.write(`  ${color(GREEN, "\u2713")} lint: no warnings or errors\n`);
  }
}

function printIssue(issue: ProfileLintIssue): void {
  const isWarning = issue.severity === "warning";
  const prefix = isWarning ? "W" : "E";
  const colorCode = isWarning ? YELLOW : RED;
  const ruleDoc = issue.rule in PROFILE_LINT_RULES
    ? PROFILE_LINT_RULES[issue.rule as keyof typeof PROFILE_LINT_RULES]
    : undefined;
  const title = ruleDoc ? ` (${ruleDoc.title})` : "";

  process.stdout.write(
    `  ${color(colorCode, prefix)} ${issue.rule}${title}: ${issue.message}\n`,
  );
  if (issue.details && issue.details.length > 0) {
    for (const detail of issue.details) {
      process.stdout.write(`      ${detail}\n`);
    }
  }
}

function color(code: string, text: string): string {
  if (process.env.NO_COLOR) return text;
  return `${code}${text}${RESET}`;
}
