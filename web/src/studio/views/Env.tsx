/**
 * Environment Variables — per-folder `.env` viewer. Reads the real file from an
 * allowlisted set of project folders via the dashboard API; secret values are
 * masked server-side and only fetched raw on an explicit reveal. Ported from
 * the cue-studio design (studio-env.jsx), disk-backed instead of localStorage.
 *
 * Table view = parsed rows with type badges + per-row copy/reveal.
 * Raw view   = read-only reconstruction of the .env (masked unless revealing).
 * A footer offers to wire the secret-mcp bouncer into the active profile.
 */

import { useEffect, useState } from "react";

import { useEnvFolders, useEnv, fetchEnvReveal, fetchEnvRevealAll, addMcp, type EnvVarRow } from "../api";

export function EnvView({ profile }: { profile: string | null }) {
  const folders = useEnvFolders();
  const list = folders.data?.folders ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"table" | "raw">("table");
  const [revealAll, setRevealAll] = useState(false);
  // Per-row revealed raw values, keyed by var name. Cleared when the folder
  // changes so one folder's plaintext never bleeds into the next.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  // Default to the first folder that actually has variables, else the first.
  useEffect(() => {
    if (sel || list.length === 0) return;
    setSel((list.find((f) => f.count > 0) ?? list[0]!).path);
  }, [list, sel]);
  useEffect(() => { setRevealed({}); setRevealAll(false); }, [sel]);

  // Baseline is ALWAYS masked; revealed plaintext lives only in `revealed`
  // (transient state), never in the cached query — so it can't linger after Hide.
  const env = useEnv(sel);
  const vars = env.data?.vars ?? [];

  // Global reveal: fetch every secret raw once into the transient map; Hide
  // clears it. Per-row reveal uses the same map, so both paths stay cache-free.
  const toggleRevealAll = async () => {
    if (revealAll) { setRevealAll(false); setRevealed({}); return; }
    if (!sel) return;
    const all = await fetchEnvRevealAll(sel);
    setRevealed(all);
    setRevealAll(true);
  };

  const copy = (key: string, value: string) => {
    try { void navigator.clipboard.writeText(value); } catch { /* clipboard blocked */ }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1100);
  };
  const toggleRow = async (v: EnvVarRow) => {
    if (revealed[v.key] !== undefined) {
      setRevealed((r) => { const n = { ...r }; delete n[v.key]; return n; });
      return;
    }
    if (!sel) return;
    const raw = await fetchEnvReveal(sel, v.key);
    setRevealed((r) => ({ ...r, [v.key]: raw }));
  };
  // Displayed value for a row: per-row reveal wins, then global reveal (server
  // already unmasked), else the masked value the server sent.
  const shownValue = (v: EnvVarRow): string => (revealed[v.key] !== undefined ? revealed[v.key]! : v.value);
  const isMasked = (v: EnvVarRow): boolean => v.kind === "secret" && revealed[v.key] === undefined && v.masked;

  const installSecretMcp = async () => {
    if (!profile) { setInstallMsg("no active profile"); return; }
    setInstalling(true); setInstallMsg(null);
    try {
      const r = await addMcp("secret-mcp", profile);
      setInstallMsg(r.alreadyPresent ? "already wired into this profile" : `added to ${r.profile}`);
    } catch (e) {
      setInstallMsg((e as Error).message);
    } finally { setInstalling(false); }
  };

  const selFolder = list.find((f) => f.path === sel);

  return (
    <div className="envpage">
      <aside className="env-rail">
        <div className="env-rail-h">PROJECT FOLDERS <span>{list.length}</span></div>
        {list.map((f) => {
          const on = f.path === sel;
          return (
            <div key={f.path} className={"env-folder" + (on ? " on" : "")} onClick={() => setSel(f.path)}>
              <span className="ef-ico">📁</span>
              <div className="ef-mid"><div className="ef-tag">{f.tag}</div><div className="ef-path">{f.path}</div></div>
              <span className={"ef-count" + (f.count ? "" : " zero")}>{f.count || "—"}</span>
            </div>
          );
        })}
        <div className="env-rail-note">Each folder loads its own variables from its real <span className="mono">.env</span> on disk — no need to open it in the repo.</div>
      </aside>

      <section className="env-main">
        <div className="env-head">
          <div>
            <div className="page-title" style={{ fontSize: 18 }}>🔑 Environment Variables</div>
            <div className="env-sub">
              <span className="mono">{sel ?? "—"}/</span><span className="env-dim">.env</span> · <b>{vars.length}</b> variables
              {env.data && !env.data.exists && <span className="env-dim"> · no .env on disk</span>}
            </div>
          </div>
          <div className="env-actions">
            <div className="env-modetog">
              <button className={mode === "table" ? "on" : ""} onClick={() => setMode("table")}>Table</button>
              <button className={mode === "raw" ? "on" : ""} onClick={() => setMode("raw")}>Raw</button>
            </div>
            <button className="env-revealbtn" onClick={() => void toggleRevealAll()}>{revealAll ? "🙈 Hide" : "👁 Reveal"} secrets</button>
          </div>
        </div>

        {env.isLoading ? (
          <div className="env-empty">Loading <span className="mono">{selFolder?.tag ?? sel}</span>…</div>
        ) : mode === "raw" ? (
          <div className="env-rawwrap">
            <div className="env-rawhint">Read-only view of <span className="mono">{sel}/.env</span>. Secrets stay masked unless you reveal them.</div>
            <textarea className="env-raw" readOnly spellCheck={false}
              value={vars.map((v) => `${v.key}=${shownValue(v)}`).join("\n")} />
          </div>
        ) : (
          <div className="env-table">
            <div className="env-trow env-thead"><span>key</span><span>value</span><span>type</span></div>
            {vars.length === 0 && <div className="env-empty">No variables in this folder's <span className="mono">.env</span>.</div>}
            {vars.map((v, idx) => {
              const masked = isMasked(v);
              return (
                <div className="env-trow" key={idx}>
                  <span className="env-key">{v.key}</span>
                  <span className="env-val">
                    <span className={"env-valtxt" + (masked ? " masked" : "")}>{shownValue(v)}</span>
                    <button className={"env-copy" + (copied === v.key ? " done" : "")} onClick={() => copy(v.key, shownValue(v))} title="copy value">{copied === v.key ? "✓" : "⧉"}</button>
                    {v.kind === "secret" && <button className="env-eye" onClick={() => void toggleRow(v)} title={masked ? "reveal" : "hide"}>{masked ? "👁" : "🙈"}</button>}
                  </span>
                  <span className={"env-type " + v.kind}>{v.kind}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="env-vault">
          <span className="env-vault-ic">🔒</span>
          <div className="env-vault-mid">
            <div className="env-vault-h">Vault these secrets with <span className="mono">secret-mcp</span></div>
            <div className="env-vault-sub">A bouncer MCP that holds Infisical-backed secrets in memory and runs provider calls without ever returning the values to the agent.</div>
          </div>
          <button className="env-vault-btn" disabled={installing || !profile} onClick={() => void installSecretMcp()}>
            {installing ? "installing…" : "INSTALL"}
          </button>
          {installMsg && <span className="env-vault-msg">{installMsg}</span>}
        </div>
      </section>
    </div>
  );
}
