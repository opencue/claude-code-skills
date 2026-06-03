/**
 * MCP servers page. Two sections:
 *  1. "Connected" — one card per server wired into the active profile, with its
 *     tool inventory, connection command, and which skills declare it. Server
 *     ids + "used by" are live from /profile-detail; tool lists/transport come
 *     from curated.ts (cue doesn't introspect live MCPs); latency/calls have no
 *     source yet so they read "—".
 *  2. "Available in cue" — every other MCP in cue's catalog (/mcps/catalog),
 *     each with a part-aware Add button that writes the id into a physical
 *     part-profile's profile.yaml via POST /mcps/add. Composite active profiles
 *     have no file to write, so the button targets a chosen part (default: the
 *     most-specific / last part).
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useProfileDetail, useMcpCatalog, addMcp, type StudioMcpRef, type McpCatalogEntry } from "../api";
import { nsColor, mcpInfo } from "../curated";

function StatBig({ n, l, accent }: { n: React.ReactNode; l: string; accent?: string }) {
  return <div className="statbig"><div className={"sb-n" + (accent ? " " + accent : "")}>{n}</div><div className="sb-l">{l}</div></div>;
}
function Statup({ n, l }: { n: React.ReactNode; l: string }) {
  return <div className="mc-stat"><div className="n">{n}</div><div className="l">{l}</div></div>;
}

function NsChip({ ref_ }: { ref_: string }) {
  const ns = ref_.split("/")[0]!;
  return <span className="mc-chip"><span className="d" style={{ background: nsColor(ns) }}></span>{ref_}</span>;
}

function CmdLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(cmd); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return (
    <div className="mc-cmd"><span className="prompt">$</span><span className="cmd-txt">{cmd}</span>
      <span className="mc-copy" onClick={copy}>{copied ? "copied ✓" : "copy"}</span></div>
  );
}

function McpCard({ m, usedBy }: { m: StudioMcpRef; usedBy: string[] }) {
  const info = mcpInfo(m.id);
  return (
    <div className="mc-card">
      <div className="mc-head">
        <div className="mc-emoji">{info.emoji}</div>
        <div style={{ minWidth: 0 }}>
          <div className="mc-name">{m.id}</div>
          <div className="mc-badges">
            <span className="mc-badge ok">● {m.status}</span>
            <span className="mc-badge">{info.transport}</span>
            <span className="mc-badge">{info.tools.length} tools</span>
          </div>
        </div>
      </div>
      <div className="mc-desc">{info.desc}</div>
      <div className="mc-stats">
        <Statup n={info.tools.length || "—"} l="TOOLS" />
        <Statup n="—" l="LATENCY" />
        <Statup n="—" l="CALLS · 30D" />
        <Statup n={usedBy.length} l="USED BY" />
      </div>
      {info.tools.length > 0 && (
        <div>
          <div className="mc-label">TOOLS</div>
          <div className="mc-tools" style={{ marginTop: 8 }}>{info.tools.map((t) => <span key={t} className="mc-tool">{t}<span className="dt-paren">()</span></span>)}</div>
        </div>
      )}
      <div>
        <div className="mc-label">CONNECTION</div>
        <div style={{ marginTop: 8 }}><CmdLine cmd={info.cmd} /></div>
      </div>
      {usedBy.length > 0 && (
        <div>
          <div className="mc-label">USED BY SKILLS</div>
          <div className="mc-used" style={{ marginTop: 8 }}>{usedBy.map((u) => <NsChip key={u} ref_={u} />)}</div>
        </div>
      )}
    </div>
  );
}

type AddState = { phase: "idle" | "adding" | "done" | "error"; msg?: string };

function CatalogCard({ entry, parts, onAdded }: { entry: McpCatalogEntry; parts: string[]; onAdded: () => void }) {
  const info = mcpInfo(entry.id);
  const composite = parts.length > 1;
  const [target, setTarget] = useState(parts[parts.length - 1] ?? "");
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState<AddState>({ phase: "idle" });

  // Don't fall back to mcpInfo().desc here — its generic text says "wired into
  // this profile", which is false for a not-yet-connected catalog entry.
  const desc = entry.description || "MCP server available in cue's catalog — not wired into this profile yet.";

  async function doAdd(toProfile: string) {
    if (!toProfile) { setState({ phase: "error", msg: "no target profile" }); return; }
    setState({ phase: "adding" });
    setPicking(false);
    try {
      const res = await addMcp(entry.id, toProfile);
      setState({
        phase: "done",
        msg: res.alreadyPresent
          ? `already in ${toProfile}`
          : `added to ${toProfile} · relaunch cue to load`,
      });
      onAdded();
    } catch (err) {
      setState({ phase: "error", msg: (err as Error).message });
    }
  }

  function onAddClick() {
    if (state.phase === "adding") return;
    if (composite) setPicking((p) => !p);
    else doAdd(parts[0] ?? "");
  }

  return (
    <div className="mc-card mc-card-cat">
      <div className="mc-head">
        <div className="mc-emoji">{info.emoji}</div>
        <div style={{ minWidth: 0 }}>
          <div className="mc-name">{entry.id}</div>
          <div className="mc-badges">
            <span className="mc-badge">{entry.transport}</span>
            <span className="mc-badge dim">not connected</span>
          </div>
        </div>
      </div>
      <div className="mc-desc">{desc}</div>
      {entry.install && (
        <div>
          <div className="mc-label">INSTALL</div>
          <div style={{ marginTop: 8 }}><CmdLine cmd={entry.install} /></div>
        </div>
      )}
      <div className="mc-cat-foot">
        {entry.usedBy.length > 0 && (
          <div className="mc-usedby" title={`Wired into: ${entry.usedBy.map((u) => u.name).join(", ")}`}>
            <span className="mc-usedby-l">used by</span>
            {entry.usedBy.slice(0, 7).map((u) => (
              <span className="mc-usedby-chip" key={u.name} title={u.name}>
                {u.iconImage
                  ? <img src={`/api/v1/profile-icon?profile=${encodeURIComponent(u.name)}`} alt="" width={18} height={18}
                      style={{ borderRadius: 4, objectFit: "contain", display: "block" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; const s = e.currentTarget.nextElementSibling as HTMLElement | null; if (s) s.style.display = ""; }} />
                  : null}
                <span style={u.iconImage ? { display: "none" } : undefined}>{u.icon ?? "•"}</span>
              </span>
            ))}
            {entry.usedBy.length > 7 && <span className="mc-usedby-more">+{entry.usedBy.length - 7}</span>}
          </div>
        )}
        <div className="mc-cat-actions">
          {state.phase === "done" ? (
            <span className="mc-add-note ok">✓ {state.msg}</span>
          ) : state.phase === "error" ? (
            <span className="mc-add-note err">{state.msg}</span>
          ) : picking ? (
            <div className="mc-target">
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {parts.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="mc-add-btn go" onClick={() => doAdd(target)}>add →</button>
            </div>
          ) : (
            <button className="mc-add-btn" onClick={onAddClick} disabled={state.phase === "adding"}>
              {state.phase === "adding" ? "adding…" : composite ? "+ add to profile" : `+ add to ${parts[0] ?? "profile"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function McpsView({ profile }: { profile: string | null }) {
  const { data } = useProfileDetail(profile ?? undefined);
  const catalog = useMcpCatalog();
  const qc = useQueryClient();

  const mcps = data?.mcps ?? [];
  const parts = data?.parts ?? [];
  const totalTools = mcps.reduce((a, m) => a + mcpInfo(m.id).tools.length, 0);
  // Real "used by": skills whose frontmatter uses[] names this server.
  const usedByOf = (id: string) => (data?.skills ?? []).filter((s) => s.uses.includes(id)).map((s) => s.id);

  const connectedIds = new Set(mcps.map((m) => m.id));
  const available = (catalog.data ?? []).filter((e) => !connectedIds.has(e.id));

  const refreshAfterAdd = () => {
    qc.invalidateQueries({ queryKey: ["profile-detail"] });
    qc.invalidateQueries({ queryKey: ["mcp-catalog"] });
    qc.invalidateQueries({ queryKey: ["status"] });
  };

  return (
    <div className="mcpage">
      <div className="page-head">
        <div>
          <div className="page-title">🔌 MCP Servers</div>
          <div className="page-sub">Model Context Protocol servers wired into the active profile.</div>
        </div>
        <div className="mcp-summary">
          <StatBig n={mcps.length} l="connected" accent="green" />
          <StatBig n={totalTools} l="tools exposed" />
          <StatBig n={available.length} l="available" />
          <StatBig n={<span className="ok-check">●</span>} l="all healthy" accent="green" />
        </div>
      </div>

      <div className="mcp-grid">
        {mcps.map((m) => <McpCard key={m.id} m={m} usedBy={usedByOf(m.id)} />)}
      </div>

      <div className="mcp-section-head">
        <span className="mcp-section-title">Available in cue</span>
        <span className="mcp-section-sub">
          {catalog.isLoading
            ? "loading catalog…"
            : catalog.isError
              ? "catalog unavailable"
              : `${available.length} more in the catalog · adds to ${parts.length > 1 ? "a chosen part-profile" : (parts[0] ?? "the active profile")}`}
        </span>
      </div>
      <div className="mcp-grid">
        {available.map((e) => <CatalogCard key={e.id} entry={e} parts={parts} onAdded={refreshAfterAdd} />)}
        {!catalog.isLoading && catalog.isError && (
          <div className="mc-add">
            <div className="mc-add-t">Couldn't load the MCP catalog.</div>
            <div className="mc-add-s">restart <code>cue dashboard</code> to pick up /mcps/catalog</div>
          </div>
        )}
        {!catalog.isLoading && !catalog.isError && available.length === 0 && (
          <div className="mc-add">
            <div className="mc-add-t">Every catalog MCP is already wired in.</div>
            <div className="mc-add-s">cue mcps available · to double-check</div>
          </div>
        )}
      </div>
    </div>
  );
}
