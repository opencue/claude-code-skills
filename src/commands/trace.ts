/**
 * `cue trace` — live session inspector. Tails active session for skill/MCP usage.
 */

import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { watch } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

function findLatestSession(): string | null {
  if (!existsSync(PROJECTS_DIR)) return null;

  let latest: { path: string; mtime: number } | null = null;

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
          const mtime = statSync(full).mtimeMs;
          if (!latest || mtime > latest.mtime) {
            latest = { path: full, mtime };
          }
        }
      } catch { /* skip */ }
    }
  }
  return latest?.path ?? null;
}

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function parseLine(line: string): string | null {
  try {
    const obj = JSON.parse(line);

    // Tool use (MCP calls)
    if (obj.type === "tool_use" || obj.tool_name) {
      const tool = obj.tool_name ?? obj.name ?? "unknown";
      const input = obj.input ? JSON.stringify(obj.input).slice(0, 80) : "";
      return `  🔧 mcp: ${tool}${input ? ` (${input}...)` : ""}`;
    }

    // Assistant message with skill reference
    if (obj.type === "assistant" && obj.content) {
      const text = typeof obj.content === "string" ? obj.content : JSON.stringify(obj.content);
      // Check for skill file reads
      const skillMatch = text.match(/skills\/([a-z-]+\/[a-z-]+)/);
      if (skillMatch) return `  📖 skill: ${skillMatch[1]}`;
    }

    // User message
    if (obj.type === "human" || obj.role === "user") {
      const text = typeof obj.content === "string" ? obj.content : "";
      const slashCmd = text.match(/^\/([a-z][-a-z]*)/);
      if (slashCmd) return `  ⚡ command: /${slashCmd[1]}`;
      return `  💬 user: ${text.slice(0, 60)}${text.length > 60 ? "..." : ""}`;
    }

    return null;
  } catch {
    return null;
  }
}

export async function run(args: string[]): Promise<number> {
  const sessionFile = findLatestSession();

  if (!sessionFile) {
    process.stderr.write("No active session found. Start a Claude Code session first.\n");
    return 1;
  }

  process.stdout.write(`🔍 Tracing: ${sessionFile}\n`);
  process.stdout.write(`   Press Ctrl+C to stop.\n\n`);

  // Read existing content to get current position
  let position = 0;
  try {
    position = statSync(sessionFile).size;
  } catch { /* start from 0 */ }

  // Watch for changes
  const watcher = watch(sessionFile, () => {
    try {
      const content = readFileSync(sessionFile, "utf8");
      const newContent = content.slice(position);
      position = content.length;

      for (const line of newContent.split("\n").filter(Boolean)) {
        const parsed = parseLine(line);
        if (parsed) {
          process.stdout.write(`${formatTime()} ${parsed}\n`);
        }
      }
    } catch { /* file may be temporarily locked */ }
  });

  // Keep alive until Ctrl+C
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      watcher.close();
      process.stdout.write("\n👋 Trace stopped.\n");
      resolve();
    });
  });

  return 0;
}
