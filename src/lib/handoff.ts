/**
 * Profile handoff protocol — when one agent finishes and hands off to another
 * (via Colony), include which skills were most useful in the handoff context.
 *
 * The receiving agent knows what worked for the previous agent.
 *
 * Storage: ~/.config/cue/handoffs/<session-id>.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HANDOFFS_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "cue",
  "handoffs",
);

export interface HandoffContext {
  id: string;
  ts: string;
  from_profile: string;
  from_agent: string;
  to_profile?: string;
  task_summary: string;
  skills_used: { id: string; usefulness: "high" | "medium" | "low" }[];
  mcps_used: string[];
  notes: string;
}

export function createHandoff(ctx: Omit<HandoffContext, "id" | "ts">): HandoffContext {
  mkdirSync(HANDOFFS_DIR, { recursive: true });
  const id = `handoff-${Date.now().toString(36)}`;
  const handoff: HandoffContext = { id, ts: new Date().toISOString(), ...ctx };
  writeFileSync(join(HANDOFFS_DIR, `${id}.json`), JSON.stringify(handoff, null, 2));
  return handoff;
}

export function getLatestHandoff(): HandoffContext | null {
  if (!existsSync(HANDOFFS_DIR)) return null;
  const files = readdirSync(HANDOFFS_DIR).filter(f => f.endsWith(".json")).sort().reverse();
  if (!files.length) return null;
  try {
    return JSON.parse(readFileSync(join(HANDOFFS_DIR, files[0]!), "utf8"));
  } catch { return null; }
}

export function getHandoff(id: string): HandoffContext | null {
  const path = join(HANDOFFS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function listHandoffs(limit = 10): HandoffContext[] {
  if (!existsSync(HANDOFFS_DIR)) return [];
  const files = readdirSync(HANDOFFS_DIR).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit);
  const results: HandoffContext[] = [];
  for (const f of files) {
    try { results.push(JSON.parse(readFileSync(join(HANDOFFS_DIR, f), "utf8"))); } catch { /* skip */ }
  }
  return results;
}

/**
 * Format a handoff context as a concise string for injection into the
 * receiving agent's session (e.g. prepended to CLAUDE.md or passed via Colony).
 */
export function formatHandoffForAgent(h: HandoffContext): string {
  const highSkills = h.skills_used.filter(s => s.usefulness === "high").map(s => s.id);
  const medSkills = h.skills_used.filter(s => s.usefulness === "medium").map(s => s.id);

  let out = `## Handoff from "${h.from_profile}" (${h.from_agent})\n`;
  out += `> ${h.task_summary}\n\n`;
  if (highSkills.length) out += `**Most useful skills:** ${highSkills.join(", ")}\n`;
  if (medSkills.length) out += `**Also helpful:** ${medSkills.join(", ")}\n`;
  if (h.mcps_used.length) out += `**MCPs used:** ${h.mcps_used.join(", ")}\n`;
  if (h.notes) out += `\n**Notes:** ${h.notes}\n`;
  return out;
}
