/**
 * Shared help utility for commands.
 * Returns true if --help was requested (caller should return 0).
 */

export function showHelp(args: string[], usage: string): boolean {
  if (args.includes("-h") || args.includes("--help") || args.includes("help")) {
    process.stdout.write(usage);
    return true;
  }
  return false;
}
