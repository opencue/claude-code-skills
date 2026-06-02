import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetcher, postJson } from "../lib/fetcher";
import { fmtRelative } from "../lib/format";

interface SessionRow {
  pid: number;
  profile: string;
  profileSource?: "env" | "config-dir" | "cwd-pin" | "unpinned";
  agent: string | null;
  cwd: string | null;
  startedAt: string;
}

const SOURCE_HINTS: Record<NonNullable<SessionRow["profileSource"]>, string> = {
  "env":        "from CUE_PROFILE env var",
  "config-dir": "inferred from CLAUDE_CONFIG_DIR path",
  "cwd-pin":    "from .cue-profile in cwd",
  "unpinned":   "no profile pinned — agent running outside cue",
};

interface ActiveSessionsData {
  supported: boolean;
  sessions: SessionRow[];
}

interface ProfilesRow {
  name: string;
  claudeMdBytes: number | null;
}

export function ActiveSessions() {
  const queryClient = useQueryClient();
  const [stopping, setStopping] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => fetcher<ActiveSessionsData>("/active-sessions"),
    refetchInterval: 10_000,
  });

  // Pull profile sizes for the in-flight-tokens rollup. Failures here just
  // mean the rollup hides — the rest of the card still works.
  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => fetcher<ProfilesRow[]>("/profiles"),
  });

  if (isLoading) return <Card><div className="empty">Scanning processes…</div></Card>;
  if (loadError) return <Card><div className="empty">{(loadError as Error).message}</div></Card>;
  if (!data) return null;

  if (!data.supported) {
    return (
      <Card>
        <Header count={null} />
        <div className="empty">
          Process scan needs Linux <code>/proc</code>. On macOS/Windows this
          card stays empty; everything else on the dashboard still works.
        </div>
      </Card>
    );
  }

  // Group sessions by profile so we can show "3× medusa-vite" rollups and
  // per-profile token-cost-in-flight (composite profiles look up by full name).
  const byProfile = new Map<string, SessionRow[]>();
  for (const s of data.sessions) {
    const list = byProfile.get(s.profile) ?? [];
    list.push(s);
    byProfile.set(s.profile, list);
  }
  const groups = [...byProfile.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const sizeFor = (profile: string): number | null => {
    const row = profiles?.find((p) => p.name === profile);
    return row?.claudeMdBytes ?? null;
  };

  // In-flight tokens = Σ (sessions × CLAUDE.md tokens) for each profile.
  // Imprecise but directionally useful — answers "how much am I burning on
  // having three sessions of the same profile open?"
  let totalInFlight: number | null = null;
  for (const [profile, rows] of groups) {
    const bytes = sizeFor(profile);
    if (bytes == null) continue;
    totalInFlight = (totalInFlight ?? 0) + Math.round((bytes * rows.length) / 4);
  }

  async function killSession(pid: number, profile: string) {
    if (!confirm(`Stop session ${pid} (${profile})?`)) return;
    setStopping(pid);
    setError(null);
    try {
      // Route through postJson so the base URL (/api/v1) and demo-mode guard
      // are handled the same way as every other call — a raw fetch here was
      // the bug: in demo mode it hit a backend-less static host and 404'd.
      await postJson("/sessions/kill", { pid, signal: "SIGTERM" });
      // Optimistic refresh — the /proc scan needs a moment to notice.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["active-sessions"] }), 600);
    } catch (err) {
      setError(`stop ${pid}: ${(err as Error).message}`);
    } finally {
      setStopping(null);
    }
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }

  return (
    <Card>
      <Header count={data.sessions.length} />

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: "rgba(248,113,113,.1)", border: "1px solid var(--red)", borderRadius: 6, fontSize: 12, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {data.sessions.length === 0 ? (
        <div className="empty">
          No agent sessions running right now. Launch one with{" "}
          <code>cue launch claude</code> or <code>cue launch codex</code>.
        </div>
      ) : (
        <div>
          {/* Per-profile chips + token-in-flight rollup */}
          <div className="session-chips">
            {groups.map(([profile, rows]) => {
              const bytes = sizeFor(profile);
              const inFlight = bytes != null ? Math.round((bytes * rows.length) / 4) : null;
              return (
                <span
                  key={profile}
                  className="session-chip"
                  title={`${profile}${inFlight != null ? ` · ~${inFlight.toLocaleString()} tokens in flight` : ""}`}
                >
                  <span className="chip-name">{profile}</span>
                  <span className="chip-count">×{rows.length}</span>
                  {inFlight != null && (
                    <span className="chip-tok">
                      ~{inFlight >= 1000 ? `${(inFlight / 1000).toFixed(1)}k` : inFlight}
                    </span>
                  )}
                </span>
              );
            })}
            {totalInFlight != null && (
              <span className="session-total">= ~{totalInFlight.toLocaleString()} tokens in flight</span>
            )}
          </div>

          <table className="table session-table">
            <thead>
              <tr>
                <th></th>
                <th>Profile</th>
                <th>Agent</th>
                <th>cwd</th>
                <th className="num">PID</th>
                <th className="num">Up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.pid}>
                  <td><span className="dot green" /></td>
                  <td
                    className="mono"
                    title={s.profileSource ? SOURCE_HINTS[s.profileSource] : ""}
                    style={s.profile === "(unpinned)" ? { color: "var(--text-dim)", fontStyle: "italic" } : undefined}
                  >
                    {s.profile}
                    {s.profileSource && s.profileSource !== "env" && s.profileSource !== "unpinned" && (
                      <span className="dim" style={{ marginLeft: 6, fontSize: 10 }}>
                        ({s.profileSource})
                      </span>
                    )}
                  </td>
                  <td className="dim">{s.agent ?? "—"}</td>
                  <td
                    className="mono dim copyable"
                    style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={`${s.cwd ?? ""}\n(click to copy)`}
                    onClick={() => s.cwd && copyToClipboard(s.cwd)}
                  >
                    {shortCwd(s.cwd)}
                  </td>
                  <td
                    className="num mono copyable"
                    title="click to copy PID"
                    onClick={() => copyToClipboard(String(s.pid))}
                  >
                    {s.pid}
                  </td>
                  <td className="num dim">{fmtRelative(s.startedAt) || "—"}</td>
                  <td className="num">
                    <button
                      className="session-stop"
                      onClick={() => killSession(s.pid, s.profile)}
                      disabled={stopping === s.pid}
                      title="Send SIGTERM to this session"
                    >
                      {stopping === s.pid ? "…" : "stop"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>
            Click cwd or PID to copy. Token-in-flight = sum of materialized CLAUDE.md size × session count per profile.
          </div>
        </div>
      )}
    </Card>
  );
}

function shortCwd(cwd: string | null): string {
  if (!cwd) return "—";
  const homeMatch = cwd.match(/^\/home\/[^/]+(.*)$/);
  const trimmed = homeMatch ? `~${homeMatch[1]}` : cwd;
  if (trimmed.length <= 60) return trimmed;
  const parts = trimmed.split("/");
  if (parts.length < 5) return trimmed.slice(0, 30) + "…" + trimmed.slice(-25);
  return `${parts.slice(0, 2).join("/")}/…/${parts.slice(-2).join("/")}`;
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="card">{children}</section>;
}

function Header({ count }: { count: number | null }) {
  const title = count == null
    ? "Active agent sessions"
    : `Active agent sessions${count > 0 ? ` (${count})` : ""}`;
  return (
    <div className="card-header">
      <div className="row">
        <span className={`dot ${count && count > 0 ? "green" : "yellow"}`} />
        <span className="card-title">{title}</span>
      </div>
      <code className="card-cta">cue dashboard</code>
    </div>
  );
}
