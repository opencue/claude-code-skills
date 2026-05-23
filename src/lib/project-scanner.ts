/**
 * Project scanner — detect project type from filesystem signals.
 * Used by both `cue auto-detect` and `cue init`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectInfo {
  languages: string[];
  frameworks: string[];
  tools: string[];
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
}

export function scanProject(cwd: string): ProjectInfo {
  const info: ProjectInfo = {
    languages: [],
    frameworks: [],
    tools: [],
    hasTests: false,
    hasDocker: false,
    hasCI: false,
  };

  // Languages
  if (existsSync(join(cwd, "tsconfig.json")) || existsSync(join(cwd, "package.json"))) {
    info.languages.push("TypeScript");
  }
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "setup.py"))) {
    info.languages.push("Python");
  }
  if (existsSync(join(cwd, "go.mod"))) info.languages.push("Go");
  if (existsSync(join(cwd, "Cargo.toml"))) info.languages.push("Rust");
  if (existsSync(join(cwd, "pom.xml")) || existsSync(join(cwd, "build.gradle"))) {
    info.languages.push("Java");
  }

  // Frameworks
  if (existsSync(join(cwd, "next.config.js")) || existsSync(join(cwd, "next.config.ts")) || existsSync(join(cwd, "next.config.mjs"))) {
    info.frameworks.push("Next.js");
  }
  if (existsSync(join(cwd, "vite.config.ts")) || existsSync(join(cwd, "vite.config.js"))) {
    info.frameworks.push("Vite");
  }
  if (existsSync(join(cwd, "astro.config.mjs"))) info.frameworks.push("Astro");
  if (existsSync(join(cwd, "medusa-config.js")) || existsSync(join(cwd, "medusa-config.ts"))) {
    info.frameworks.push("Medusa");
  }
  if (existsSync(join(cwd, "prisma/schema.prisma"))) info.frameworks.push("Prisma");
  if (existsSync(join(cwd, "drizzle.config.ts"))) info.frameworks.push("Drizzle");

  // Tools
  if (existsSync(join(cwd, "tailwind.config.js")) || existsSync(join(cwd, "tailwind.config.ts"))) {
    info.tools.push("Tailwind");
  }
  if (existsSync(join(cwd, ".eslintrc.js")) || existsSync(join(cwd, "eslint.config.js"))) {
    info.tools.push("ESLint");
  }
  if (existsSync(join(cwd, "biome.json"))) info.tools.push("Biome");

  // Package.json deep scan
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps.react) info.frameworks.push("React");
    if (allDeps.vue) info.frameworks.push("Vue");
    if (allDeps.svelte) info.frameworks.push("Svelte");
    if (allDeps.express || allDeps.fastify || allDeps.hono) info.frameworks.push("Node Server");
    if (pkg.scripts?.test) info.hasTests = true;
  } catch { /* no package.json */ }

  // Docker
  info.hasDocker = existsSync(join(cwd, "Dockerfile")) || existsSync(join(cwd, "docker-compose.yml"));

  // CI
  info.hasCI = existsSync(join(cwd, ".github/workflows")) || existsSync(join(cwd, ".gitlab-ci.yml"));

  // Dedupe
  info.languages = [...new Set(info.languages)];
  info.frameworks = [...new Set(info.frameworks)];
  info.tools = [...new Set(info.tools)];

  return info;
}
