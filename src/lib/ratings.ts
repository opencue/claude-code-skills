/**
 * Skill ratings — local thumbs up/down after install.
 * Storage: ~/.config/cue/ratings.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const RATINGS_PATH = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "cue",
  "ratings.json",
);

interface Rating {
  up: number;
  down: number;
  lastRated: string;
}

type Ratings = Record<string, Rating>;

function load(): Ratings {
  if (!existsSync(RATINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(RATINGS_PATH, "utf8")); } catch { return {}; }
}

function save(r: Ratings): void {
  mkdirSync(dirname(RATINGS_PATH), { recursive: true });
  writeFileSync(RATINGS_PATH, JSON.stringify(r, null, 2));
}

export function rateSkill(id: string, thumbsUp: boolean): void {
  const ratings = load();
  const entry = ratings[id] ?? { up: 0, down: 0, lastRated: "" };
  if (thumbsUp) entry.up++; else entry.down++;
  entry.lastRated = new Date().toISOString();
  ratings[id] = entry;
  save(ratings);
}

export function getRating(id: string): Rating | null {
  return load()[id] ?? null;
}

export function getAllRatings(): Ratings {
  return load();
}

export function getScore(id: string): number {
  const r = load()[id];
  if (!r) return 0;
  return r.up - r.down;
}
