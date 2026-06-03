/**
 * Permissions — the real Claude Code tool-permission rules (allow / ask / deny),
 * grouped by mode. Ported from studio-hooks.jsx's PermissionsView, but every
 * rule is live from /api/v1/permissions (the union of the managed → project →
 * user settings.json files Claude Code itself loads), not mock data.
 *
 * Read-only: the three-segment control reflects what settings.json declares for
 * each rule; it doesn't rewrite the file. The middle column shows provenance —
 * which settings file(s) the rule came from — instead of the design's hand-
 * written notes, so "everything coming from Claude Code" is traceable.
 */

import { usePermissions, type PermMode, type PermRule } from "../api";

const MODES: Record<PermMode, { label: string; color: string }> = {
  allow: { label: "allow", color: "#3ecf8e" },
  ask: { label: "ask", color: "#e0913a" },
  deny: { label: "deny", color: "#e3596a" },
};
const ORDER: PermMode[] = ["allow", "ask", "deny"];

function StatB({ n, l, accent }: { n: React.ReactNode; l: string; accent?: string }) {
  return <div className="statbig"><div className={"sb-n" + (accent ? " " + accent : "")}>{n}</div><div className="sb-l">{l}</div></div>;
}

export function PermissionsView() {
  const { data, isLoading, isError, error } = usePermissions();

  const rules = data?.rules ?? [];
  const counts = data?.counts ?? { allow: 0, ask: 0, deny: 0 };
  const defaultMode = data?.defaultMode ?? null;

  return (
    <div className="mcpage">
      <div className="page-head">
        <div>
          <div className="page-title">🔒 Permissions</div>
          <div className="page-sub">
            Tool permission rules — what Claude Code may do on its own, what needs a confirm, and what's blocked.
            Live from your settings.json{defaultMode ? <> · default mode <b style={{ color: "var(--fg)" }}>{defaultMode}</b></> : null}.
          </div>
        </div>
        <div className="mcp-summary">
          <StatB n={counts.allow} l="allow" accent="green" />
          <StatB n={counts.ask} l="ask" accent="warn" />
          <StatB n={counts.deny} l="deny" accent="red" />
        </div>
      </div>

      {isLoading && <div className="pm-group"><div className="pm-empty">Loading permissions…</div></div>}
      {isError && <div className="pm-group"><div className="pm-empty">Couldn't load permissions: {(error as Error).message}</div></div>}
      {!isLoading && !isError && rules.length === 0 && (
        <div className="pm-group"><div className="pm-empty">No permission rules in settings.json. Claude Code follows its <code>defaultMode</code>{defaultMode ? <> (<b>{defaultMode}</b>)</> : null} until you add <code>allow</code> / <code>ask</code> / <code>deny</code> rules.</div></div>
      )}

      {ORDER.map((m) => {
        const list = rules.filter((r) => r.mode === m);
        if (!list.length) return null;
        const md = MODES[m];
        return (
          <div className="pm-group" key={m}>
            <div className="pm-ghead">
              <span className="pm-gdot" style={{ background: md.color }}></span>
              <span style={{ color: md.color }}>{md.label}</span>
              <span className="pm-gn">{list.length}</span>
            </div>
            {list.map((r: PermRule, i: number) => (
              <div className="pm-rule" key={r.tool + "|" + r.pattern + "|" + i}>
                <span className="pm-pattern">
                  <b style={{ color: md.color }}>{r.tool}</b>
                  {r.pattern ? <>(<span className="pm-glob">{r.pattern}</span>)</> : null}
                </span>
                <span className="pm-note" title={r.sources.join(", ")}>{r.sources.join(", ")}</span>
                <div className="pm-modes ro" title="read-only — reflects settings.json">
                  {ORDER.map((mm) => (
                    <button key={mm} className={"pm-modebtn" + (r.mode === mm ? " on " + mm : "")} tabIndex={-1}>{MODES[mm].label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
