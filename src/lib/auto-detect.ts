/**
 * Context-aware auto-profile detection.
 * Scans cwd for project signals and scores against known profiles.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

interface Signal {
  file: string;       // glob-like path to check (relative to cwd)
  weight: number;
  profile: string;
}

const SIGNALS: Signal[] = [
  // Frontend
  { file: "next.config.js", weight: 5, profile: "frontend" },
  { file: "next.config.ts", weight: 5, profile: "frontend" },
  { file: "next.config.mjs", weight: 5, profile: "frontend" },
  { file: "vite.config.ts", weight: 4, profile: "frontend" },
  { file: "vite.config.js", weight: 4, profile: "frontend" },
  { file: "tailwind.config.js", weight: 3, profile: "frontend" },
  { file: "tailwind.config.ts", weight: 3, profile: "frontend" },
  { file: "postcss.config.js", weight: 2, profile: "frontend" },
  { file: "tsconfig.json", weight: 1, profile: "frontend" },

  // Backend
  { file: "docker-compose.yml", weight: 3, profile: "backend" },
  { file: "docker-compose.yaml", weight: 3, profile: "backend" },
  { file: "Dockerfile", weight: 2, profile: "backend" },
  { file: "prisma/schema.prisma", weight: 4, profile: "backend" },
  { file: "migrations", weight: 3, profile: "backend" },
  { file: "drizzle.config.ts", weight: 4, profile: "backend" },
  { file: "src/server.ts", weight: 3, profile: "backend" },
  { file: "src/index.ts", weight: 1, profile: "backend" },

  // Medusa
  { file: "medusa-config.js", weight: 5, profile: "medusa-dev" },
  { file: "medusa-config.ts", weight: 5, profile: "medusa-dev" },
  { file: "packages/medusa", weight: 5, profile: "medusa-dev" },

  // Docs
  { file: "astro.config.mjs", weight: 4, profile: "docs-writer" },
  { file: "docusaurus.config.js", weight: 4, profile: "docs-writer" },
  { file: "mkdocs.yml", weight: 4, profile: "docs-writer" },
  { file: "content/blog", weight: 3, profile: "docs-writer" },
  { file: "docs/", weight: 2, profile: "docs-writer" },

  // Fleet
  { file: ".colony", weight: 5, profile: "fleet-control" },
  { file: ".omx", weight: 4, profile: "fleet-control" },
  { file: "scripts/codex-fleet", weight: 5, profile: "fleet-control" },

  // Creative
  { file: "design-tokens", weight: 4, profile: "creative-media" },
  { file: "figma.config.ts", weight: 4, profile: "creative-media" },

  // Research
  { file: "research/", weight: 3, profile: "research" },
  { file: "papers/", weight: 3, profile: "research" },
];

export interface DetectionResult {
  profile: string;
  score: number;
  maxScore: number;
  confidence: number; // 0-100
  signals: string[];  // which files matched
}

export function detectProfile(cwd: string): DetectionResult[] {
  const scores = new Map<string, { score: number; max: number; signals: string[] }>();

  // Compute max possible score per profile
  for (const s of SIGNALS) {
    const entry = scores.get(s.profile) ?? { score: 0, max: 0, signals: [] };
    entry.max += s.weight;
    scores.set(s.profile, entry);
  }

  // Score based on what exists
  for (const s of SIGNALS) {
    const target = join(cwd, s.file);
    if (existsSync(target)) {
      const entry = scores.get(s.profile)!;
      entry.score += s.weight;
      entry.signals.push(s.file);
    }
  }

  return [...scores.entries()]
    .map(([profile, d]) => ({
      profile,
      score: d.score,
      maxScore: d.max,
      confidence: d.max > 0 ? Math.round((d.score / d.max) * 100) : 0,
      signals: d.signals,
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.confidence - a.confidence || b.score - a.score);
}
