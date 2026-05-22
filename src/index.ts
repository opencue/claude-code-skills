#!/usr/bin/env bun
/**
 * cue CLI entrypoint.
 *
 * Pure dispatch: parse the leading flags (--help, --version), pick a
 * subcommand from the registry in commands/_index.ts, and hand the rest of
 * argv to that command's `run(args)`. All real logic lives in command modules.
 *
 * Exit codes:
 *   0  success
 *   1  user error (unknown command, bad args, missing profile)
 *   2  internal error (uncaught exception, missing dep)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { COMMANDS, type CommandName } from "./commands/_index";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.CUE_REPO_ROOT ?? process.env.SOUL_REPO_ROOT ?? resolve(HERE, "..");

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp(): void {
  const lines: string[] = [];
  lines.push("cue — Agent Profile Manager for Claude Code & Codex");
  lines.push("Pick a profile, launch with the right skills, MCPs, and plugins.");
  lines.push("");
  lines.push("Usage: cue <command> [args...]");
  lines.push("");
  lines.push("Commands:");
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const pad = " ".repeat(width - name.length + 2);
    lines.push(`  ${name}${pad}${cmd.summary}`);
  }
  lines.push("");
  lines.push("Global flags:");
  lines.push("  -h, --help       Show this help and exit");
  lines.push("  -v, --version    Print cue version and exit");
  lines.push("");
  lines.push("Exit codes: 0 ok | 1 user error | 2 internal error");
  process.stdout.write(lines.join("\n") + "\n");
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help" || args[0] === "help") {
    printHelp();
    return 0;
  }

  if (args[0] === "-v" || args[0] === "--version" || args[0] === "version") {
    process.stdout.write(readVersion() + "\n");
    return 0;
  }

  const name = args[0] as CommandName;
  const cmd = COMMANDS[name];
  if (!cmd) {
    process.stderr.write(`cue: unknown command "${name}"\n`);
    process.stderr.write(`run "cue --help" for the list of commands\n`);
    return 1;
  }

  try {
    const mod = await cmd.load();
    return await mod.run(args.slice(1));
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`cue: internal error in "${name}": ${msg}\n`);
    return 2;
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`cue: fatal: ${err}\n`);
    process.exit(2);
  },
);
