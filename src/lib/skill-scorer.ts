/**
 * Skill effectiveness scorer — scan session transcripts for skill references.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

interface SkillUsage {
  id: string;
  references: number;
  lastSeen: string | null;
}

function getSessionFiles(limit = 20): string[] {
  const files: { path: string; mtime: number }[] = [];
  if (!existsSync(PROJECTS_DIR)) return [];

  try {
    for (const project of readdirSync(PROJECTS_DIR)) {
      const sessDir = join(PROJECTS_DIR, project, "sessions");
      if (!existsSync(sessDir)) continue;
      for (const sess of readdirSync(sessDir)) {
        const sessPath = join(sessDir, sess);
        try {
          const entries = readdirSync(sessPath);
          for (const f of entries) {
            if (!f.endsWith(".jsonl")) continue;
            const full = join(sessPath, f);
            const { mtimeMs } = require("node:fs").statSync(full);
            files.push({ path: full, mtime: mtimeMs });
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, limit).map(f => f.path);
}

export function scoreSkills(skillIds: string[], sessionLimit = 20): SkillUsage[] {
  const sessions = getSessionFiles(sessionLimit);
  const counts = new Map<string, { refs: number; last: string | null }>();

  for (const id of skillIds) {
    counts.set(id, { refs: 0, last: null });
  }

  for (const file of sessions) {
    let content: string;
    try { content = readFileSync(file, "utf8"); } catch { continue; }

    for (const id of skillIds) {
      const slug = id.split("/").pop()!;
      // Match skill slug, category/slug, or slash-command form
      const patterns = [slug, id, `/${slug}`, slug.replace(/-/g, " ")];
      let found = false;
      for (const p of patterns) {
        if (content.toLowerCase().includes(p.toLowerCase())) {
          found = true;
          break;
        }
      }
      if (found) {
        const entry = counts.get(id)!;
        entry.refs++;
        // Use file mtime as proxy for "last seen"
        try {
          const { statSync } = require("node:fs");
          const mtime = statSync(file).mtime.toISOString();
          if (!entry.last || mtime > entry.last) entry.last = mtime;
        } catch { /* skip */ }
      }
    }
  }

  return [...counts.entries()]
    .map(([id, d]) => ({ id, references: d.refs, lastSeen: d.last }))
    .sort((a, b) => a.references - b.references);
}
