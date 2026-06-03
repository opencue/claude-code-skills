/**
 * Plugins page. Auto-discovers every Claude Code plugin installed on this
 * machine (enabled or not) from Claude Code's real store, not just the ones
 * the active cue profile declares. Each card shows enabled/disabled state, an
 * "in active profile" marker, bundled-skill count, and version.
 *
 * Live from /plugins/discovered; the active profile's declared plugins
 * (/profile-detail) are cross-referenced for the "in profile" badge.
 */

import { useState } from "react";

import { useDiscoveredPlugins, useProfileDetail } from "../api";

function StatBig({ n, l, accent }: { n: React.ReactNode; l: string; accent?: string }) {
  return <div className="statbig"><div className={"sb-n" + (accent ? " " + accent : "")}>{n}</div><div className="sb-l">{l}</div></div>;
}

function CmdLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(cmd); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return (
    <div className="mc-cmd"><span className="prompt">$</span><span className="cmd-txt">{cmd}</span>
      <span className="mc-copy" onClick={copy}>{copied ? "copied ✓" : "copy"}</span></div>
  );
}

export function PluginsView({ profile }: { profile: string | null }) {
  const { data: disc, error } = useDiscoveredPlugins();
  const { data: detail } = useProfileDetail(profile ?? undefined);

  const plugins = disc?.plugins ?? [];
  const profileIds = new Set((detail?.plugins ?? []).map((p) => p.id));
  const enabledCount = plugins.filter((p) => p.enabled).length;
  const inProfileCount = plugins.filter((p) => profileIds.has(p.id)).length;

  return (
    <div className="mcpage">
      <div className="page-head">
        <div>
          <div className="page-title">🧩 Plugins</div>
          <div className="page-sub">Every Claude Code plugin installed on this machine, auto-discovered. Green = enabled now.</div>
        </div>
        <div className="mcp-summary">
          <StatBig n={plugins.length} l="installed" accent="green" />
          <StatBig n={enabledCount} l="enabled" accent="violet" />
          <StatBig n={inProfileCount} l="in profile" accent="green" />
        </div>
      </div>
      <div className="mcp-grid">
        {plugins.map((p) => (
          <div className="mc-card" key={p.id} style={{ gridColumn: "1 / -1", opacity: p.enabled ? 1 : 0.72 }}>
            <div className="mc-head">
              <div className="mc-emoji">
                <img className="mc-img" src={`/api/v1/plugin-icon?plugin=${encodeURIComponent(p.id)}`} alt="" width={28} height={28}
                  onError={(e) => { e.currentTarget.style.display = "none"; const sib = e.currentTarget.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = ""; }} />
                <span className="mc-emoji-fallback" style={{ display: "none" }}>🧩</span>
              </div>
              <div>
                <div className="mc-name">{p.name}{p.marketplace ? <span style={{ color: "var(--fg3)" }}>@{p.marketplace}</span> : null}</div>
                <div className="mc-badges">
                  {p.enabled
                    ? <span className="mc-badge ok">● enabled</span>
                    : <span className="mc-badge">○ disabled</span>}
                  {profileIds.has(p.id) && <span className="mc-badge" style={{ color: "#c264c2" }}>in profile</span>}
                  <span className="mc-badge">{p.skills} skills</span>
                  {p.version && p.version !== "unknown" && <span className="mc-badge">v{p.version}</span>}
                </div>
              </div>
            </div>
            <div className="mc-desc">{p.description || (<>Installed from {p.marketplace || "a marketplace"}. Contributes skills under the <code>plugin/</code> namespace.</>)}</div>
            <div><div className="mc-label">{p.enabled ? "ENABLED · toggle in Claude Code" : "DISABLED · enable in Claude Code or wire into a cue profile"}</div><div style={{ marginTop: 8 }}><CmdLine cmd={`cue plugin add ${p.id}`} /></div></div>
          </div>
        ))}
        {!plugins.length && (
          <div className="mc-add" style={{ gridColumn: "1 / -1" }}>
            <div className="mc-add-plus">+</div>
            <div className="mc-add-t">{error ? "Could not read the plugin store" : "No plugins installed"}</div>
            <div className="mc-add-s">{error ? String(error.message ?? error) : "Install one in Claude Code, then it appears here"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
