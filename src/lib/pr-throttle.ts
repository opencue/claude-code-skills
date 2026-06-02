/**
 * Throttle + opt-out registry for cue's outbound PRs.
 *
 * Storage: ~/.cache/cue/pr-opened.json (atomically written).
 *
 * Three responsibilities:
 *  1. **Cooldown per repo** — don't re-PR the same repo within `cooldownDays`
 *     (default 90). Cue should *never* PR a repo twice without an invitation.
 *  2. **Daily cap** — GitHub auto-flags accounts that open >30 PRs/day. We
 *     cap ourselves at 25/day with headroom for retries.
 *  3. **Opt-out cache** — if a repo's README contains `<!-- cue: ignore -->`
 *     we record it once and never check again. Idempotent on every scan.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { cacheDir } from "./config-paths";

const DEFAULT_PATH = join(cacheDir(), "pr-opened.json");

export const DEFAULT_COOLDOWN_DAYS = 90;
export const DAILY_CAP = 25;

export type EntryState =
  | "open"        // PR open on GitHub
  | "merged"      // PR was merged
  | "closed"      // PR was closed without merge
  | "opted-out"   // skipped — repo README has <!-- cue: ignore -->
  | "skipped";    // skipped for any other reason (e.g. no fixes to apply)

export interface ThrottleEntry {
  repo: string;                // owner/name
  state: EntryState;
  openedAt: string;            // ISO timestamp
  rulesFixed?: string[];       // R001, R005, etc. — only present when state was open
  prNumber?: number;
  prUrl?: string;
  fork?: string;               // owner/name of cue's fork (null after cleanup)
  branch?: string;             // branch on the fork
  reason?: string;             // optional human-readable reason
  cleanedAt?: string;          // when fork was deleted (cleanup-forks command)
}

export interface ThrottleDB {
  version: 1;
  history: ThrottleEntry[];
}

// ---------------------------------------------------------------------------
// Read + write
// ---------------------------------------------------------------------------

function emptyDb(): ThrottleDB { return { version: 1, history: [] }; }

export function loadDb(path: string = DEFAULT_PATH): ThrottleDB {
  if (!existsSync(path)) return emptyDb();
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as ThrottleDB;
    if (parsed.version !== 1 || !Array.isArray(parsed.history)) return emptyDb();
    return parsed;
  } catch {
    return emptyDb();
  }
}

/** Atomic write: temp file + rename. Survives concurrent writes. */
export function saveDb(db: ThrottleDB, path: string = DEFAULT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(db, null, 2) + "\n");
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Days since `iso` timestamp. */
function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Is this repo currently throttled? Returns reason string when throttled,
 * null when free to post. Considers cooldown + opted-out state.
 */
export function isThrottled(
  db: ThrottleDB,
  repo: string,
  cooldownDays: number = DEFAULT_COOLDOWN_DAYS,
): string | null {
  const entries = db.history.filter((e) => e.repo === repo);
  if (entries.length === 0) return null;

  // Opted out — permanent
  if (entries.some((e) => e.state === "opted-out")) {
    return "repo has <!-- cue: ignore --> in README";
  }

  // Most recent post-or-skip
  entries.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const latest = entries[0]!;
  const days = daysSince(latest.openedAt);
  if (days < cooldownDays) {
    const remaining = Math.ceil(cooldownDays - days);
    return `cooldown: last interaction was ${Math.floor(days)}d ago (state=${latest.state}); ${remaining}d remaining`;
  }
  return null;
}

/** How many PRs we've opened in the last rolling 24h window. */
export function todayCount(db: ThrottleDB): number {
  return db.history.filter((e) => e.state === "open" && daysSince(e.openedAt) < 1).length;
}

/** Headroom under DAILY_CAP. Negative means we've already exceeded. */
export function canPostMore(db: ThrottleDB): { ok: boolean; remaining: number; cap: number } {
  const used = todayCount(db);
  return { ok: used < DAILY_CAP, remaining: DAILY_CAP - used, cap: DAILY_CAP };
}

/** List entries by state — for the cleanup-forks command. */
export function filterByState(db: ThrottleDB, states: EntryState[]): ThrottleEntry[] {
  const set = new Set(states);
  return db.history.filter((e) => set.has(e.state));
}

// ---------------------------------------------------------------------------
// Mutations — always go through these helpers so audit history is correct
// ---------------------------------------------------------------------------

export function recordOpened(
  db: ThrottleDB,
  e: { repo: string; rulesFixed: string[]; prNumber: number; prUrl: string; fork: string; branch: string },
): ThrottleDB {
  db.history.push({
    repo: e.repo,
    state: "open",
    openedAt: new Date().toISOString(),
    rulesFixed: e.rulesFixed,
    prNumber: e.prNumber,
    prUrl: e.prUrl,
    fork: e.fork,
    branch: e.branch,
  });
  return db;
}

export function recordOptOut(db: ThrottleDB, repo: string): ThrottleDB {
  db.history.push({
    repo,
    state: "opted-out",
    openedAt: new Date().toISOString(),
    reason: "README contains <!-- cue: ignore -->",
  });
  return db;
}

export function recordSkipped(db: ThrottleDB, repo: string, reason: string): ThrottleDB {
  db.history.push({
    repo,
    state: "skipped",
    openedAt: new Date().toISOString(),
    reason,
  });
  return db;
}

export function updateEntryState(
  db: ThrottleDB,
  match: { repo: string; prNumber?: number },
  newState: EntryState,
  extra: Partial<ThrottleEntry> = {},
): ThrottleDB {
  for (const e of db.history) {
    if (e.repo !== match.repo) continue;
    if (match.prNumber !== undefined && e.prNumber !== match.prNumber) continue;
    e.state = newState;
    Object.assign(e, extra);
  }
  return db;
}

// ---------------------------------------------------------------------------
// Opt-out check — fetches README via gh, looks for the marker
// ---------------------------------------------------------------------------

export const OPT_OUT_MARKER = "<!-- cue: ignore -->";
/**
 * Opposite of OPT_OUT_MARKER: when --opt-in-only mode is active, we only
 * post PRs to repos whose README contains this marker. Lets authors flip
 * the consent model from "assumed yes" to "explicit yes".
 */
export const OPT_IN_MARKER = "<!-- cue: ok -->";

/**
 * Look in the cached DB first; if not seen, caller should fetch the README
 * and call `recordOptOut` if it matches. Keeping the fetch out of this module
 * keeps it dependency-free + easily testable.
 */
export function hasRecordedOptOut(db: ThrottleDB, repo: string): boolean {
  return db.history.some((e) => e.repo === repo && e.state === "opted-out");
}
