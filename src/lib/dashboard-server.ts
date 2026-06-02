/**
 * Dashboard HTTP server — read-only JSON endpoints over the same data the
 * `cue status`, `cue gates`, `cue skill-report`, `cue suggest-pairs`, and
 * `cue trigger-gaps` commands consume.
 *
 * MVP (this turn): server + endpoints. React UI lives under `web/` and ships
 * in a follow-up turn; today the endpoints can be curled / scripted against.
 *
 * Bind to 127.0.0.1 only by default. The data on disk includes user prompts
 * and skill activations — there is no auth layer in v1, and binding to a
 * public interface would be a privacy footgun.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { configDir } from "./config-paths";
import { computeStats } from "./analytics";
import { listActiveSessions, supportsProcScan } from "./active-sessions";
import { readGateStatus, readAllGateStatus } from "./gate-status";
import { computeAffinityMap, suggestionsByProfile } from "./pair-suggestions";
import { computeSkillUsage } from "./skill-report";
import { computeTriggerGaps } from "./trigger-gaps";
import { loadProfile, listProfiles } from "./profile-loader";
import {
  mergeProfiles,
  renderMerged,
  writeMergedProfile,
  MergedProfileExists,
  type OptimizeAction,
  type MergeMode,
} from "./profile-merge";
import { validateProfileName } from "./profile-generator";
import { parseSkillFromDir } from "./skill-router";
import { resolveLocalSkill } from "./resolver-local";
import { resolveProfileForCwd } from "./cwd-resolver";
import { quickDiagnose } from "../commands/status";
import { isEnabled as telemetryEnabled } from "./telemetry-consent";
import { collectUserPrompts } from "../commands/trigger-gaps";

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, "..", "..", "..");
const WEB_DIST = join(REPO_ROOT, "web", "dist");

/** Standard envelope so the UI doesn't have to special-case per-endpoint shape. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };


/**
 * Resolve a `?profile=...` query against precedence: explicit → cwd pin →
 * CUE_PROFILE env. Returns null when nothing's set so the handler can
 * return a useful "no profile" error instead of throwing.
 */
function resolveProfileQuery(explicit: string | null): string | null {
  if (explicit) return explicit;
  const pin = join(process.cwd(), ".cue-profile");
  if (existsSync(pin)) {
    try {
      const txt = readFileSync(pin, "utf8").trim().split("\n")[0]?.trim();
      if (txt) return txt;
    } catch { /* ignore */ }
  }
  return process.env.CUE_PROFILE ?? null;
}

function parseSinceDays(raw: string | null, fallback = 30): number {
  if (!raw) return fallback;
  const m = raw.match(/^(\d+)\s*d?$/);
  return m ? Math.max(1, parseInt(m[1]!, 10)) : fallback;
}

// ---------------------------------------------------------------------------
// Handlers — each takes URLSearchParams, returns ApiResult<unknown>.
// Pulled out as plain functions so they're trivially unit-testable without
// going through the HTTP layer.
// ---------------------------------------------------------------------------

interface ProfilePartSummary {
  name: string;
  description: string;
  skills: number;
  mcps: number;
  plugins: number;
}

export async function handleStatus(): Promise<ApiResult<unknown>> {
  const resolved = await resolveProfileForCwd({
    cwd: process.cwd(),
    homeDir: homedir(),
    configDir: configDir(),
  });
  const hasProfile = resolved.source !== "none";
  let profile: ProfilePartSummary | null = null;
  let parts: ProfilePartSummary[] = [];
  let warnings: unknown[] = [];
  let gateRun = null;
  if (hasProfile) {
    const profileName = (resolved as { profile: string }).profile;
    try {
      const loaded = await loadProfile(profileName);
      profile = {
        name: loaded.name,
        description: loaded.description,
        skills: loaded.skills.local.length + loaded.skills.npx.length,
        mcps: loaded.mcps.length,
        plugins: loaded.plugins.length,
      };
      warnings = quickDiagnose(profileName, loaded);

      // Composite breakdown — when the active selector is `a+b+c`, load each
      // part independently so the dashboard can show the per-part skill /
      // MCP / plugin counts. The composite's totals (in `profile` above)
      // already reflect dedupe + merge; the parts pre-dedupe row sums will
      // exceed them, which is the whole point — it shows what each part
      // contributes. Failures per-part are silent: better to show one part
      // missing than to fall back to no breakdown.
      const partNames = profileName.split("+").map((s) => s.trim()).filter(Boolean);
      if (partNames.length > 1) {
        for (const partName of partNames) {
          try {
            const part = await loadProfile(partName);
            parts.push({
              name: part.name,
              description: part.description,
              skills: part.skills.local.length + part.skills.npx.length,
              mcps: part.mcps.length,
              plugins: part.plugins.length,
            });
          } catch {
            parts.push({
              name: partName,
              description: "(failed to load)",
              skills: 0, mcps: 0, plugins: 0,
            });
          }
        }
      }
    } catch (err) {
      warnings = [{ code: "D0", message: `cannot load profile: ${(err as Error).message}` }];
    }
    gateRun = readGateStatus(profileName);
  }
  const stats = computeStats();
  return {
    ok: true,
    data: {
      profile,
      parts,
      source: resolved.source,
      warnings,
      gates: gateRun
        ? {
            ts: gateRun.ts,
            overall: gateRun.overall,
            failed: gateRun.results.filter((r) => !r.ok).map((r) => r.name),
          }
        : null,
      totalProfiles: (await listProfiles()).length,
      totalSessions: stats.reduce((a, s) => a + s.sessions, 0),
      telemetryEnabled: telemetryEnabled(),
    },
  };
}

export async function handleProfiles(): Promise<ApiResult<unknown>> {
  const names = await listProfiles();
  const runtimeRoot = join(configDir(), "runtime");
  const rows = names.map((name) => {
    const claudeMd = join(runtimeRoot, name, "claude", "CLAUDE.md");
    let sizeBytes: number | null = null;
    try {
      if (existsSync(claudeMd)) sizeBytes = statSync(claudeMd).size;
    } catch { /* ignore */ }
    return { name, claudeMdBytes: sizeBytes };
  });
  return { ok: true, data: rows };
}

/** Profiles dir the merge engine writes to — honors the same env override. */
function mergeProfilesDir(): string {
  return process.env.CUE_PROFILES_DIR ?? join(REPO_ROOT, "profiles");
}

/**
 * Full profile inventory for the Merge Studio source list: every profile's
 * resolved skill/MCP/plugin counts plus its `bundles`/`conflicts` hints.
 * Resolution failures (offline npx, missing MCP) degrade to a per-row error
 * rather than failing the whole list.
 */
export async function handleProfilesFull(): Promise<ApiResult<unknown>> {
  const names = await listProfiles();
  const rows = await Promise.all(
    names.map(async (name) => {
      try {
        const p = await loadProfile(name);
        return {
          name,
          icon: p.icon ?? null,
          description: p.description,
          skills: p.skills.local.length,
          npx: p.skills.npx.length,
          mcps: p.mcps.length,
          plugins: p.plugins.length,
          bundles: p.bundles ?? [],
          conflicts: p.conflicts ?? [],
          inheritsCore: p.inheritanceChain.includes("core"),
          error: null as string | null,
        };
      } catch (err) {
        return { name, error: (err as Error).message };
      }
    }),
  );
  return { ok: true, data: rows };
}

interface MergeRequest {
  names?: string[];
  name?: string;
  mode?: MergeMode;
  actions?: OptimizeAction[];
  budget?: number;
  force?: boolean;
}

/** Preview-only merge (no write). Returns the preview + both rendered modes. */
export async function handleMergePreview(body: MergeRequest | null): Promise<ApiResult<unknown>> {
  const names = body?.names;
  if (!Array.isArray(names) || names.length < 2) {
    return { ok: false, error: "need at least 2 source profiles" };
  }
  try {
    const preview = await mergeProfiles(names, {
      name: body?.name,
      optimize: body?.actions,
      budget: body?.budget,
    });
    return {
      ok: true,
      data: {
        preview,
        yaml: { static: renderMerged(preview, "static"), alias: renderMerged(preview, "alias") },
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Write a merged profile to disk. Refuses overwrite unless `force`. */
export async function handleMergeSave(body: MergeRequest | null): Promise<ApiResult<unknown>> {
  const names = body?.names;
  const name = body?.name;
  if (!Array.isArray(names) || names.length < 2) {
    return { ok: false, error: "need at least 2 source profiles" };
  }
  if (!name || !validateProfileName(name)) {
    return { ok: false, error: "invalid profile name (use lowercase kebab-case)" };
  }
  const mode: MergeMode = body?.mode === "alias" ? "alias" : "static";
  try {
    const preview = await mergeProfiles(names, { name, optimize: body?.actions, budget: body?.budget });
    const yaml = renderMerged(preview, mode);
    const existingPath = join(mergeProfilesDir(), name, "profile.yaml");
    const previousYaml = existsSync(existingPath) ? readFileSync(existingPath, "utf8") : null;
    const path = await writeMergedProfile(name, yaml, { force: body?.force });
    return { ok: true, data: { path, mode, created: previousYaml === null, yaml, previousYaml } };
  } catch (err) {
    if (err instanceof MergedProfileExists) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function handleSkillReport(params: URLSearchParams): Promise<ApiResult<unknown>> {
  if (!telemetryEnabled()) return { ok: false, error: "telemetry-disabled" };
  const name = resolveProfileQuery(params.get("profile"));
  if (!name) return { ok: false, error: "no-profile" };
  const sinceDays = parseSinceDays(params.get("since"));
  try {
    const profile = await loadProfile(name);
    const rows = computeSkillUsage(profile, { windowDays: sinceDays });
    return { ok: true, data: { profile: name, windowDays: sinceDays, rows } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function handlePairs(params: URLSearchParams): Promise<ApiResult<unknown>> {
  if (!telemetryEnabled()) return { ok: false, error: "telemetry-disabled" };
  const affinity = computeAffinityMap();
  const sug = suggestionsByProfile(affinity);
  const profileFilter = params.get("profile");
  const rows = [...sug.entries()]
    .filter(([profile]) => !profileFilter || profile === profileFilter)
    .map(([profile, partners]) => ({ profile, partners }))
    .sort((a, b) => a.profile.localeCompare(b.profile));
  return { ok: true, data: rows };
}

export async function handleGates(params: URLSearchParams): Promise<ApiResult<unknown>> {
  if (params.get("all") === "1" || params.get("all") === "true") {
    return { ok: true, data: readAllGateStatus() };
  }
  const name = resolveProfileQuery(params.get("profile"));
  if (!name) return { ok: false, error: "no-profile" };
  return { ok: true, data: readGateStatus(name) };
}

export async function handleTriggerGaps(params: URLSearchParams): Promise<ApiResult<unknown>> {
  if (!telemetryEnabled()) return { ok: false, error: "telemetry-disabled" };
  const name = resolveProfileQuery(params.get("profile"));
  if (!name) return { ok: false, error: "no-profile" };
  const sinceDays = parseSinceDays(params.get("since"));
  try {
    const profile = await loadProfile(name);
    const skills = [];
    const skillRefs = (profile.skills?.local ?? [])
      .map((s) => typeof s === "string" ? s : s.id)
      .filter((id) => !id.includes("*"));
    for (const id of skillRefs) {
      try {
        const dir = await resolveLocalSkill(id);
        skills.push(await parseSkillFromDir(id, dir));
      } catch { /* skip unresolvable */ }
    }
    const userPrompts = collectUserPrompts(sinceDays);
    const usage = computeSkillUsage(profile, { windowDays: sinceDays });
    const hits = new Map<string, number>();
    for (const u of usage) hits.set(u.id, u.hits);
    const rows = computeTriggerGaps({ skills, userPrompts, hits });
    return {
      ok: true,
      data: { profile: name, windowDays: sinceDays, promptsScanned: userPrompts.length, rows },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function handleActiveSessions(): Promise<ApiResult<unknown>> {
  // Linux-only via /proc. Returning `supported:false` so the UI can render
  // a clear "platform not supported" message instead of a confused empty list.
  if (!supportsProcScan()) {
    return { ok: true, data: { supported: false, sessions: [] } };
  }
  return { ok: true, data: { supported: true, sessions: listActiveSessions() } };
}

/**
 * Stop one cue-launched agent session by PID. Verifies the target is
 * actually one of ours (has `CUE_PROFILE` in /proc/<pid>/environ) before
 * sending the signal — refuses to kill arbitrary system processes even if
 * the dashboard is exposed beyond loopback.
 */
export async function handleKillSession(
  body: { pid?: number; signal?: NodeJS.Signals } | null,
): Promise<ApiResult<unknown>> {
  if (!body || typeof body.pid !== "number" || !Number.isFinite(body.pid)) {
    return { ok: false, error: "missing-pid" };
  }
  const pid = body.pid;
  if (pid === process.pid) return { ok: false, error: "refuses-to-kill-self" };

  // Authorization: target must be a cue-launched session right now.
  const session = listActiveSessions().find((s) => s.pid === pid);
  if (!session) {
    return { ok: false, error: "not-a-cue-session" };
  }

  const signal: NodeJS.Signals = body.signal === "SIGKILL" ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(pid, signal);
    return { ok: true, data: { pid, signal, profile: session.profile } };
  } catch (err) {
    return { ok: false, error: `kill failed: ${(err as Error).message}` };
  }
}

export async function handleTelemetryTimeline(params: URLSearchParams): Promise<ApiResult<unknown>> {
  if (!telemetryEnabled()) return { ok: false, error: "telemetry-disabled" };
  const sinceDays = parseSinceDays(params.get("since"));
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const events = computeStats({ since: cutoff });
  // Bucket sessions per profile per day. Computed from session counts since
  // we don't have per-day rollups; close enough for a sparkline.
  return {
    ok: true,
    data: {
      windowDays: sinceDays,
      profiles: events.map((e) => ({
        profile: e.profile,
        sessions: e.sessions,
        lastUsed: e.last_used,
      })),
    },
  };
}

const ROUTES: Record<string, (params: URLSearchParams) => Promise<ApiResult<unknown>>> = {
  "/api/v1/status":             () => handleStatus(),
  "/api/v1/profiles":           () => handleProfiles(),
  "/api/v1/profiles/full":      () => handleProfilesFull(),
  "/api/v1/skill-report":       (p) => handleSkillReport(p),
  "/api/v1/pairs":              (p) => handlePairs(p),
  "/api/v1/gates":              (p) => handleGates(p),
  "/api/v1/trigger-gaps":       (p) => handleTriggerGaps(p),
  "/api/v1/active-sessions":    () => handleActiveSessions(),
  "/api/v1/telemetry/timeline": (p) => handleTelemetryTimeline(p),
};

function contentTypeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js"))   return "application/javascript; charset=utf-8";
  if (path.endsWith(".css"))  return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg"))  return "image/svg+xml";
  if (path.endsWith(".png"))  return "image/png";
  return "application/octet-stream";
}

/**
 * Build the request handler. Exported so tests can mount it without
 * actually binding a port.
 */
export function createHandler(): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    // Write-side endpoints (POST). Kept on a small, explicit allowlist so
    // the read-only GET surface stays clearly separated. 127.0.0.1 binding
    // is the v1 trust boundary — anyone hitting these from localhost is
    // assumed to be the user.
    if (req.method === "POST" && url.pathname === "/api/v1/sessions/kill") {
      let body: { pid?: number; signal?: NodeJS.Signals } | null = null;
      try { body = (await req.json()) as typeof body; } catch { /* malformed */ }
      const result = await handleKillSession(body);
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/merge/preview") {
      let body: unknown = null;
      try { body = await req.json(); } catch { /* malformed */ }
      const result = await handleMergePreview(body as Parameters<typeof handleMergePreview>[0]);
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/merge/save") {
      let body: unknown = null;
      try { body = await req.json(); } catch { /* malformed */ }
      const result = await handleMergeSave(body as Parameters<typeof handleMergeSave>[0]);
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }

    if (url.pathname.startsWith("/api/v1/")) {
      const handler = ROUTES[url.pathname];
      if (!handler) {
        return Response.json({ ok: false, error: "not-found" }, { status: 404 });
      }
      try {
        const result = await handler(url.searchParams);
        return Response.json(result, {
          status: result.ok ? 200 : 400,
          headers: { "Cache-Control": "max-age=5" },
        });
      } catch (err) {
        return Response.json(
          { ok: false, error: (err as Error).message },
          { status: 500 },
        );
      }
    }

    // Static file serving for the React app (when web/dist/ exists).
    if (existsSync(WEB_DIST)) {
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = join(WEB_DIST, requested);
      // Prevent path traversal — the resolved path must stay inside WEB_DIST.
      const resolved2 = resolve(file);
      if (!resolved2.startsWith(WEB_DIST)) {
        return new Response("forbidden", { status: 403 });
      }
      if (existsSync(resolved2) && statSync(resolved2).isFile()) {
        return new Response(readFileSync(resolved2), {
          headers: { "Content-Type": contentTypeFor(resolved2) },
        });
      }
      // SPA fallback — any unknown path serves index.html so client-side
      // routing works.
      const indexHtml = join(WEB_DIST, "index.html");
      if (existsSync(indexHtml)) {
        return new Response(readFileSync(indexHtml), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    // No web build yet — emit a friendly JSON shaped like the API so curl
    // users see what they're getting.
    return Response.json(
      {
        ok: true,
        data: {
          message: "cue dashboard server running — UI not yet built (run a future release with web/dist)",
          api: Object.keys(ROUTES),
        },
      },
      { status: 200 },
    );
  };
}

/** Discover web build status without trying to start the server. */
export function webDistExists(): boolean {
  return existsSync(WEB_DIST);
}
