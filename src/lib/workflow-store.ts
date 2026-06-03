/**
 * Cue workflow store — the on-disk format + CRUD for visually-authored
 * Claude Code workflows (the n8n-style canvas in cue studio).
 *
 * A workflow is a DAG of cue primitives (skills, commands, subagents, MCP
 * tools) saved as resources/workflows/<name>.json. The shape is deliberately
 * React-Flow-compatible (nodes carry id + position, edges carry source/target
 * + handles) so the studio canvas can load/save with no translation layer.
 *
 * This module is pure storage + validation; execution lives in a separate
 * runtime (M4). Read-only callers (list/load) never throw; writes validate the
 * name and shape and throw WorkflowError on bad input.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, "..", "..", "..");

/** Where workflow JSON lives. Honors the same env override as profiles. */
export function workflowsDir(): string {
  return process.env.CUE_WORKFLOWS_DIR ?? join(REPO_ROOT, "resources", "workflows");
}

export type WorkflowNodeKind =
  | "trigger"   // entry point (manual / on-message / cron) — no cue ref
  | "skill"     // a cue skill, e.g. "meta/analyze"
  | "command"   // a slash command, e.g. "goal"
  | "subagent"  // a delegatable specialist
  | "mcp"       // an MCP tool call, e.g. lightpanda.goto
  | "note";     // a free-text sticky, no execution

export interface WorkflowNode {
  /** Unique within the workflow (React Flow node id). */
  id: string;
  kind: WorkflowNodeKind;
  /** The cue primitive this node invokes (skill id / command / subagent / "mcp:tool"). Empty for trigger/note. */
  ref: string;
  /** Display label on the canvas. */
  label: string;
  position: { x: number; y: number };
  /** Per-node params: prompt, args, the chosen MCP tool, etc. */
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface CueWorkflow {
  version: 1;
  /** Slug, equal to the filename stem. */
  name: string;
  title: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowSummary {
  name: string;
  title: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string | null;
}

export class WorkflowError extends Error {}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Validate a workflow name: slug only, no path traversal. */
export function assertValidName(name: string): void {
  if (!NAME_RE.test(name) || name.includes("..") || name.length > 64) {
    throw new WorkflowError(`invalid workflow name: ${name}`);
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Every saved workflow, newest-updated first. Never throws. */
export function listWorkflows(): WorkflowSummary[] {
  const dir = workflowsDir();
  if (!existsSync(dir)) return [];
  const out: WorkflowSummary[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const wf = readJson<CueWorkflow>(join(dir, f));
    if (!wf || typeof wf.name !== "string") continue;
    out.push({
      name: wf.name,
      title: wf.title ?? wf.name,
      description: wf.description ?? "",
      nodeCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
      edgeCount: Array.isArray(wf.edges) ? wf.edges.length : 0,
      updatedAt: wf.updatedAt ?? null,
    });
  }
  return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** Load one workflow by name, or null when absent/corrupt. */
export function loadWorkflow(name: string): CueWorkflow | null {
  assertValidName(name);
  return readJson<CueWorkflow>(join(workflowsDir(), `${name}.json`));
}

/**
 * Validate + persist a workflow. `nowIso` is injected (the dashboard server
 * stamps it) so this module stays free of wall-clock calls. Returns the saved
 * doc with timestamps applied.
 */
export function saveWorkflow(input: unknown, nowIso: string): CueWorkflow {
  const wf = input as Partial<CueWorkflow>;
  if (!wf || typeof wf !== "object") throw new WorkflowError("workflow must be an object");
  if (typeof wf.name !== "string") throw new WorkflowError("workflow.name is required");
  assertValidName(wf.name);
  if (!Array.isArray(wf.nodes)) throw new WorkflowError("workflow.nodes must be an array");
  if (!Array.isArray(wf.edges)) throw new WorkflowError("workflow.edges must be an array");

  const dir = workflowsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = loadWorkflow(wf.name);

  const doc: CueWorkflow = {
    version: 1,
    name: wf.name,
    title: wf.title ?? wf.name,
    description: wf.description ?? "",
    nodes: wf.nodes as WorkflowNode[],
    edges: wf.edges as WorkflowEdge[],
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  writeFileSync(join(dir, `${wf.name}.json`), JSON.stringify(doc, null, 2) + "\n");
  return doc;
}
