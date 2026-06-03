/**
 * Curated enrichment — the small set of values cue's proxy has no real source
 * for yet. Everything here is presentation metadata layered on top of REAL
 * proxy data (skill ids, mcp ids, profile parts all come from the server):
 *
 *  - namespace colours (cosmetic, matches the cue TUI palette)
 *  - MCP tool inventories + transport (cue doesn't introspect live MCP servers,
 *    so the well-known servers are described here; unknown ones degrade)
 *  - the Workflows gallery (cue has no "workflow" concept on disk — these are
 *    starter templates that chain real skills/commands)
 *
 * Kept in one file, clearly labelled, so "live from proxy" vs "curated" never
 * blurs. When a real backend lands for any of these, delete the relevant block.
 */

// ── namespace colours (cue TUI palette) ──────────────────────────────────
const NS_COLORS: Record<string, string> = {
  meta: "#e0913a",
  caveman: "#9b7bd4",
  plan: "#3ecf8e",
  review: "#e3596a",
  browser: "#56b6c2",
  tools: "#d4b53a",
  gstack: "#34c3c3",
  github: "#8b7bf0",
  npx: "#d4b53a",
  plugin: "#c264c2",
  common: "#878d9a",
  typescript: "#56b6c2",
};
const FALLBACK_NS = ["#8b7bf0", "#3ecf8e", "#e0913a", "#56b6c2", "#e3596a", "#d46fb0", "#34c3c3"];

/** Stable colour for a namespace — curated where known, hashed otherwise. */
export function nsColor(ns: string): string {
  if (NS_COLORS[ns]) return NS_COLORS[ns]!;
  let h = 0;
  for (let i = 0; i < ns.length; i++) h = (h * 31 + ns.charCodeAt(i)) >>> 0;
  return FALLBACK_NS[h % FALLBACK_NS.length]!;
}

/** Human label for a namespace (some carry a provenance suffix). */
export function nsLabel(ns: string): string {
  if (ns === "npx") return "npx · anthropics/skills";
  if (ns === "plugin") return "plugin · claude-mem";
  return ns;
}

// ── MCP enrichment ───────────────────────────────────────────────────────
export interface McpInfo {
  emoji: string;
  transport: string;
  tools: string[];
  desc: string;
  cmd: string;
  /** True when this is curated knowledge, not introspected from a live server. */
  curated: boolean;
}

const KNOWN_MCPS: Record<string, McpInfo> = {
  "cue-tty-watch": {
    emoji: "🖥️",
    transport: "stdio",
    tools: ["screenshot", "find_text", "detect_scenes", "tmux_pane", "send_keys_tmux", "send_keys_xdotool", "list_xwindows", "ask_about_image", "redact_video"],
    desc: "Streams the active terminal/X11 pane back into cue so skills can read live tty state and drive it.",
    cmd: "bunx cue-tty-watch --pane $CUE_PANE",
    curated: true,
  },
  lightpanda: {
    emoji: "🐼",
    transport: "stdio",
    tools: ["goto", "click", "fill", "eval", "markdown", "screenshot", "links", "waitForSelector", "scroll", "press"],
    desc: "Fast headless browser. Backs the browser/lightpanda skill for rendering, scraping, and CDP automation.",
    cmd: "bunx lightpanda serve --headless",
    curated: true,
  },
  gbrain: {
    emoji: "🧠",
    transport: "sse",
    tools: ["put_page", "get_page", "search", "query", "think", "traverse_graph", "get_backlinks", "get_stats"],
    desc: "Graph-memory server. Gives analyze + mcp-finder long-term recall and a knowledge graph across sessions.",
    cmd: "https://gbrain.local/sse",
    curated: true,
  },
};

/** Curated MCP detail for a server id; a generic degraded entry when unknown. */
export function mcpInfo(id: string): McpInfo {
  return (
    KNOWN_MCPS[id] ?? {
      emoji: "🔌",
      transport: "stdio",
      tools: [],
      desc: "MCP server wired into this profile. Tool inventory is resolved at runtime — not introspected here.",
      cmd: `cue mcp add ${id}`,
      curated: false,
    }
  );
}

/** Render a markdown SKILL.md-style body for an MCP, for the editor preview. */
export function mcpBody(id: string, status: string): string {
  const m = mcpInfo(id);
  const toolList = m.tools.length ? m.tools.map((t) => "- `" + t + "()`").join("\n") : "- _(resolved at runtime)_";
  return `---
mcp: ${id}
transport: ${m.transport}
status: ${status}
tools: ${m.tools.length}
---

# ${id}

${m.desc}

## Tools

${toolList}

## Connection

\`\`\`
${m.cmd}
\`\`\`

> Status: ${status} · transport ${m.transport} · ${m.tools.length} tools${m.curated ? "" : " (tool list not introspected)"}.`;
}

// ── part / profile emoji (dashboard leaderboard + merge chips) ────────────
const PART_EMOJI: Record<string, string> = {
  gstack: "🎲", "skill-writer": "🖋", "skill-w": "🖋", core: "🧠", improver: "📈",
  frontend: "🎛", vite: "⚡", higgsfield: "✨", backend: "🔧", "medusa-vite": "🏬",
  hosting: "☁️", commerce: "🛒", postizz: "📮", growth: "🌱", builder: "👷",
  studio: "🎬", maker: "🛠", designer: "🎨", marketing: "📣", research: "🔬",
  browser: "🌐", nextjs: "▲", vercel: "🔼", aws: "☁️", coolify: "🧊",
};
export function partEmoji(p: string): string {
  const k = p.replace(/…$/, "");
  return PART_EMOJI[p] || PART_EMOJI[k] || "📦";
}

// ── Workflows (starter templates — no on-disk source yet) ─────────────────
export interface WorkflowStep { name: string; kind?: "command" }
export interface Workflow {
  id: string; name: string; emoji: string; trigger: string; est: string;
  desc: string; steps: WorkflowStep[];
}

export const WORKFLOWS: Workflow[] = [
  { id: "ship", name: "ship-it", emoji: "🚀", trigger: "/ship", est: "~62K",
    desc: "Investigate, deep-review, fix and checkpoint — the full path from change to green.",
    steps: [{ name: "investigate" }, { name: "code-review-deep" }, { name: "build-fix", kind: "command" }, { name: "checkpoint", kind: "command" }] },
  { id: "analyze", name: "deep-analyze", emoji: "🔍", trigger: "manual", est: "~31K",
    desc: "Read-only investigation that answers a question with evidence-ranked synthesis.",
    steps: [{ name: "analyze" }, { name: "integrity-tags" }, { name: "next-steps" }] },
  { id: "newskill", name: "author-skill", emoji: "🧪", trigger: "/skill-lint", est: "~44K",
    desc: "Discover a gap, scaffold the skill, review it, eval it, and save it into the profile.",
    steps: [{ name: "skill-discovery" }, { name: "cli-writer" }, { name: "skill-reviewer" }, { name: "skill-eval" }, { name: "save-profile" }] },
  { id: "release", name: "weekly-release", emoji: "📦", trigger: "weekly · cron", est: "~18K",
    desc: "Roll up the week: retro, timeline and a digest of everything that shipped.",
    steps: [{ name: "retro" }, { name: "document-release" }, { name: "canary" }] },
  { id: "guard", name: "merge-guard", emoji: "🛡", trigger: "on merge", est: "~27K",
    desc: "Keep the profile lean and safe before a merge lands.",
    steps: [{ name: "profile-optimizer" }, { name: "profile-fit-monitor" }, { name: "guard", kind: "command" }] },
];

// ── small formatters ─────────────────────────────────────────────────────
/** Seconds → compact "2h 28m" / "10d 21h" / "41m". */
export function fmtDuration(totalS: number): string {
  if (!totalS || totalS < 0) return "0m";
  const d = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** ISO timestamp → "just now" / "4m" / "1h 04m" relative-age. */
export function fmtAge(startedAt: string): string {
  if (!startedAt) return "—";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${String(rem).padStart(2, "0")}m`;
}

/** Cheap derived stats from a SKILL.md body (no telemetry needed). */
export function bodyStats(body: string): { lines: number; words: number; headings: number; codeBlocks: number; listItems: number; readMin: number } {
  const lines = body.split("\n");
  const words = (body.match(/\S+/g) ?? []).length;
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
  const fences = lines.filter((l) => l.startsWith("```")).length;
  const listItems = lines.filter((l) => /^\s*([-*]|\d+\.)\s/.test(l)).length;
  return { lines: lines.length, words, headings, codeBlocks: Math.floor(fences / 2), listItems, readMin: Math.max(1, Math.round(words / 200)) };
}

/** Abbreviate large counts: 1234 → "1.2k", 1_200_000 → "1.2M". */
export function abbrev(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}
