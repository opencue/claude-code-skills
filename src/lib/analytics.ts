/**
 * Analytics — append-only JSONL log of profile usage.
 * Storage: ~/.config/cue/analytics.jsonl
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const ANALYTICS_PATH = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "cue",
  "analytics.jsonl",
);

export interface SessionEvent {
  ts: string;
  event: "start" | "end";
  profile: string;
  agent: "claude-code" | "codex";
  cwd: string;
  duration_s?: number;
}

export function recordEvent(event: SessionEvent): void {
  mkdirSync(dirname(ANALYTICS_PATH), { recursive: true });
  appendFileSync(ANALYTICS_PATH, JSON.stringify(event) + "\n");
}

export function readEvents(since?: Date): SessionEvent[] {
  if (!existsSync(ANALYTICS_PATH)) return [];
  const lines = readFileSync(ANALYTICS_PATH, "utf8").split("\n").filter(Boolean);
  const events: SessionEvent[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as SessionEvent;
      if (since && new Date(e.ts) < since) continue;
      events.push(e);
    } catch { /* skip malformed */ }
  }
  return events;
}

export interface ProfileStats {
  profile: string;
  sessions: number;
  total_duration_s: number;
  avg_duration_s: number;
  last_used: string | null;
}

export function computeStats(since?: Date): ProfileStats[] {
  const events = readEvents(since);
  const map = new Map<string, { sessions: number; total_s: number; last: string }>();

  for (const e of events) {
    if (e.event !== "start") continue;
    const entry = map.get(e.profile) ?? { sessions: 0, total_s: 0, last: "" };
    entry.sessions++;
    if (e.ts > entry.last) entry.last = e.ts;
    map.set(e.profile, entry);
  }

  for (const e of events) {
    if (e.event !== "end" || !e.duration_s) continue;
    const entry = map.get(e.profile);
    if (entry) entry.total_s += e.duration_s;
  }

  return [...map.entries()]
    .map(([profile, d]) => ({
      profile,
      sessions: d.sessions,
      total_duration_s: d.total_s,
      avg_duration_s: d.sessions > 0 ? Math.round(d.total_s / d.sessions) : 0,
      last_used: d.last || null,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}
