/**
 * Context-aware auto-profile detection.
 * Scans cwd for project signals and scores against known profiles.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Signal {
  file: string;       // glob-like path to check (relative to cwd)
  weight: number;
  profile: string;
}

export const SIGNALS: Signal[] = [
  // Frontend / Next.js
  { file: "next.config.js", weight: 5, profile: "nextjs" },
  { file: "next.config.ts", weight: 5, profile: "nextjs" },
  { file: "next.config.mjs", weight: 5, profile: "nextjs" },
  { file: "app/layout.tsx", weight: 4, profile: "nextjs" },
  { file: "app/page.tsx", weight: 3, profile: "nextjs" },
  { file: "next.config.js", weight: 4, profile: "frontend" },
  { file: "next.config.ts", weight: 4, profile: "frontend" },
  { file: "next.config.mjs", weight: 4, profile: "frontend" },
  { file: "vite.config.ts", weight: 4, profile: "frontend" },
  { file: "vite.config.js", weight: 4, profile: "frontend" },
  { file: "tailwind.config.js", weight: 3, profile: "frontend" },
  { file: "tailwind.config.ts", weight: 3, profile: "frontend" },
  { file: "postcss.config.js", weight: 2, profile: "frontend" },
  { file: "tsconfig.json", weight: 1, profile: "frontend" },

  // Backend (Node/TS)
  { file: "docker-compose.yml", weight: 3, profile: "backend" },
  { file: "docker-compose.yaml", weight: 3, profile: "backend" },
  { file: "Dockerfile", weight: 2, profile: "backend" },
  { file: "prisma/schema.prisma", weight: 4, profile: "backend" },
  { file: "migrations", weight: 3, profile: "backend" },
  { file: "drizzle.config.ts", weight: 4, profile: "backend" },
  { file: "src/server.ts", weight: 3, profile: "backend" },
  { file: "src/index.ts", weight: 1, profile: "backend" },
  { file: ".github/workflows/", weight: 1, profile: "backend" },

  // Python API
  { file: "pyproject.toml", weight: 4, profile: "python" },
  { file: "setup.py", weight: 3, profile: "python" },
  { file: "requirements.txt", weight: 3, profile: "python" },
  { file: "app/main.py", weight: 5, profile: "python" },
  { file: "main.py", weight: 3, profile: "python" },
  { file: "manage.py", weight: 5, profile: "python" },
  { file: "uvicorn.ini", weight: 4, profile: "python" },
  { file: "alembic.ini", weight: 4, profile: "python" },
  { file: ".python-version", weight: 2, profile: "python" },

  // Rust
  { file: "Cargo.toml", weight: 5, profile: "rust" },
  { file: "Cargo.lock", weight: 3, profile: "rust" },
  { file: "src/main.rs", weight: 4, profile: "rust" },
  { file: "src/lib.rs", weight: 3, profile: "rust" },
  { file: ".cargo/config.toml", weight: 2, profile: "rust" },

  // Go API
  { file: "go.mod", weight: 5, profile: "go-api" },
  { file: "go.sum", weight: 3, profile: "go-api" },
  { file: "cmd/", weight: 3, profile: "go-api" },
  { file: "internal/", weight: 2, profile: "go-api" },
  { file: "main.go", weight: 4, profile: "go-api" },

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

  // Three.js
  { file: "three.js", weight: 4, profile: "threejs" },

  // Generic Claude-managed repo → baseline profile
  { file: "CLAUDE.md", weight: 2, profile: "core" },
  { file: ".claude/", weight: 2, profile: "core" },

  // Full (meta)
  { file: "profiles/", weight: 2, profile: "full" },
];

export interface DetectionResult {
  profile: string;
  score: number;
  maxScore: number;
  confidence: number; // 0-100
  signals: string[];  // which files matched
}

/**
 * V2 detection result with 0-1 confidence and reasons array.
 */
export interface DetectionResultV2 {
  profile: string;
  confidence: number; // 0.0 - 1.0
  reasons: string[];
}

/**
 * Read package.json dependencies to boost detection.
 */
function readPackageDeps(cwd: string): { deps: Set<string>; devDeps: Set<string> } {
  const deps = new Set<string>();
  const devDeps = new Set<string>();
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.dependencies) for (const k of Object.keys(pkg.dependencies)) deps.add(k);
    if (pkg.devDependencies) for (const k of Object.keys(pkg.devDependencies)) devDeps.add(k);
  } catch { /* no package.json or invalid */ }
  return { deps, devDeps };
}

/** True when any dependency name starts with `prefix` (for scoped packages). */
function hasPrefix(deps: Set<string>, prefix: string): boolean {
  for (const d of deps) if (d.startsWith(prefix)) return true;
  return false;
}

/** True when any of `names` is present in the dependency set. */
function hasAny(deps: Set<string>, names: string[]): boolean {
  for (const n of names) if (deps.has(n)) return true;
  return false;
}

const ex = (cwd: string, rel: string): boolean => existsSync(join(cwd, rel));
const exAny = (cwd: string, rels: string[]): boolean => rels.some((r) => ex(cwd, r));

/**
 * Per-extra-signal confidence boost. A profile backed by several independent
 * signals (e.g. `medusa-config.ts` + `@medusajs/*` dep) is a stronger match
 * than one backed by a single file, so corroboration nudges confidence toward
 * the cap. Single-signal detections are untouched.
 */
const CORROBORATION_STEP = 0.05;
const CONFIDENCE_CAP = 0.97;

/**
 * Enhanced v2 detection with package.json awareness and 0-1 confidence.
 *
 * Each `add()` records the strongest single signal for a profile (max
 * confidence) and accumulates the reasons. After all signals are gathered,
 * profiles corroborated by 2+ independent signals get a small per-signal boost
 * (capped), so an agreement of weak signals can out-rank a lone strong one.
 */
export function detectProfileV2(cwd: string): DetectionResultV2[] {
  const results = new Map<string, { confidence: number; reasons: string[] }>();

  function add(profile: string, confidence: number, reason: string) {
    const entry = results.get(profile) ?? { confidence: 0, reasons: [] };
    entry.confidence = Math.max(entry.confidence, confidence);
    // Dedupe reasons so the same file counted twice doesn't inflate the boost.
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    results.set(profile, entry);
  }

  // ── Rust ──
  if (ex(cwd, "Cargo.toml")) {
    add("rust", 0.9, "Cargo.toml");
    if (ex(cwd, "src/main.rs")) add("rust", 0.7, "src/main.rs");
    if (ex(cwd, "src/lib.rs")) add("rust", 0.6, "src/lib.rs");
  }

  // ── Go ──
  if (ex(cwd, "go.mod")) add("go-api", 0.8, "go.mod");
  if (ex(cwd, "main.go")) add("go-api", 0.6, "main.go");
  if (exAny(cwd, ["cmd", "internal"])) add("go-api", 0.4, "cmd/ or internal/");

  // ── Python ──
  if (ex(cwd, "pyproject.toml")) add("python", 0.7, "pyproject.toml");
  if (ex(cwd, "requirements.txt")) add("python", 0.7, "requirements.txt");
  if (ex(cwd, "manage.py")) add("python", 0.8, "manage.py");
  if (exAny(cwd, ["alembic.ini", "app/main.py"])) add("python", 0.6, "alembic.ini or app/main.py");

  // ── Backend (containers / CI / DB) ──
  if (exAny(cwd, ["docker-compose.yml", "docker-compose.yaml", "Dockerfile"])) {
    add("backend", 0.5, "docker-compose / Dockerfile");
  }
  if (exAny(cwd, ["prisma/schema.prisma", "drizzle.config.ts"])) add("backend", 0.5, "prisma / drizzle");
  if (ex(cwd, ".github/workflows")) add("backend", 0.3, ".github/workflows/");

  // ── On-disk framework config files (corroborate the package.json deps below) ──
  if (exAny(cwd, ["next.config.js", "next.config.ts", "next.config.mjs"])) {
    add("nextjs", 0.85, "next.config.*");
  }
  if (exAny(cwd, ["vite.config.ts", "vite.config.js"])) add("frontend", 0.6, "vite.config.*");
  if (exAny(cwd, ["tailwind.config.js", "tailwind.config.ts"])) add("frontend", 0.4, "tailwind.config.*");

  // ── Docs ──
  if (exAny(cwd, ["astro.config.mjs", "docusaurus.config.js", "mkdocs.yml"])) {
    add("docs-writer", 0.7, "astro / docusaurus / mkdocs config");
  }

  // ── Medusa (commerce) — its own strongest signals ──
  const isMedusaBackend = exAny(cwd, ["medusa-config.js", "medusa-config.ts", "packages/medusa"]);
  if (isMedusaBackend) add("medusa-dev", 0.9, "medusa-config.*");

  // ── Fleet / meta ──
  if (exAny(cwd, [".colony", ".omx", "scripts/codex-fleet"])) add("fleet-control", 0.6, "fleet markers");
  if (exAny(cwd, ["CLAUDE.md", ".claude"])) add("core", 0.4, "CLAUDE.md or .claude/");
  if (ex(cwd, "profiles")) add("full", 0.3, "profiles/ dir");

  // ── package.json deps ──
  if (ex(cwd, "package.json")) {
    const { deps, devDeps } = readPackageDeps(cwd);
    const allDeps = new Set([...deps, ...devDeps]);
    const isMedusaPkg = hasPrefix(allDeps, "@medusajs/");
    if (isMedusaPkg && allDeps.has("next")) {
      // Medusa storefront on Next.js.
      add("medusa-next", 0.85, "package.json @medusajs + next");
    } else if (isMedusaPkg && hasAny(allDeps, ["vite"])) {
      // Medusa storefront on Vite (the canonical storefront pattern).
      add("medusa-vite", 0.85, "package.json @medusajs + vite");
    } else if (isMedusaPkg) {
      add("medusa-dev", 0.85, "package.json @medusajs/*");
    } else if (allDeps.has("next")) {
      add("nextjs", 0.9, "package.json has next");
    } else if (hasAny(allDeps, ["astro", "@docusaurus/core"])) {
      add("docs-writer", 0.8, "package.json docs framework");
    } else if (allDeps.has("react")) {
      add("frontend", 0.8, "package.json has react");
    } else {
      add("backend", 0.6, "package.json (no framework)");
    }
  }

  return [...results.entries()]
    .map(([profile, { confidence, reasons }]) => {
      // Corroboration boost: each signal beyond the first nudges confidence up
      // toward the cap. Lone signals keep their base value (tested contract).
      const boosted = reasons.length > 1
        ? Math.min(CONFIDENCE_CAP, confidence + CORROBORATION_STEP * (reasons.length - 1))
        : confidence;
      return { profile, confidence: boosted, reasons };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
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
