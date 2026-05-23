/**
 * `cue stats` — profile usage analytics dashboard.
 */

import { computeStats } from "../lib/analytics";

function parseSince(args: string[]): Date | undefined {
  const idx = args.indexOf("--since");
  if (idx < 0) return undefined;
  const val = args[idx + 1];
  if (!val) return undefined;
  const match = val.match(/^(\d+)([dhw])$/);
  if (!match) return new Date(val); // try ISO parse
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const ms = unit === "d" ? n * 86400000 : unit === "h" ? n * 3600000 : n * 604800000;
  return new Date(Date.now() - ms);
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

export async function run(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const since = parseSince(args);
  const profileFilter = args.indexOf("--profile") >= 0 ? args[args.indexOf("--profile") + 1] : null;

  let stats = computeStats(since);
  if (profileFilter) stats = stats.filter(s => s.profile === profileFilter);

  if (json) {
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
    return 0;
  }

  if (stats.length === 0) {
    process.stdout.write("No usage data yet. Stats are recorded after your next `claude` launch via cue.\n");
    return 0;
  }

  const sinceStr = since ? ` (since ${since.toISOString().slice(0, 10)})` : "";
  process.stdout.write(`Profile Usage${sinceStr}:\n\n`);
  process.stdout.write("  Profile            Sessions   Avg Duration   Last Used\n");
  process.stdout.write("  ─────────────────  ────────   ────────────   ─────────\n");

  for (const s of stats) {
    const name = s.profile.padEnd(17);
    const sess = String(s.sessions).padStart(8);
    const avg = formatDuration(s.avg_duration_s).padStart(12);
    const last = s.last_used ? new Date(s.last_used).toLocaleDateString() : "never";
    process.stdout.write(`  ${name}  ${sess}   ${avg}   ${last}\n`);
  }

  process.stdout.write(`\n  Total: ${stats.reduce((a, s) => a + s.sessions, 0)} sessions across ${stats.length} profiles\n`);
  return 0;
}
