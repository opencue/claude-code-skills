/**
 * Merge studio — drag building-block profiles from the palette into a
 * composite (or straight onto a saved group). Ported from studio-merge.jsx,
 * but wired to REAL data: the palette is every profile from /profiles/full,
 * the composite's deduped skill/mcp/plugin counts + token estimate +
 * collisions come from the live /merge/preview endpoint, and "Save as profile"
 * writes profiles/<name>/profile.yaml via /merge/save.
 *
 * Saved groups are local presets (cue has no on-disk "group" concept); their
 * stats are a quick client-side sum, clearly a preset board, not a merge.
 */

import { useEffect, useRef, useState } from "react";

import { useProfilesFull, useTimeline, postJson, type ProfileRow, type PreviewResponse } from "../api";
import { partEmoji } from "../curated";

function StatBig({ n, l, accent }: { n: React.ReactNode; l: string; accent?: string }) {
  return <div className="statbig"><div className={"sb-n" + (accent ? " " + accent : "")}>{n}</div><div className="sb-l">{l}</div></div>;
}

function PartChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span className="part-chip">
      <span className="pc-emoji">{partEmoji(name)}</span>{name}
      {onRemove && <span className="pc-x" onClick={onRemove}>×</span>}
    </span>
  );
}

interface Group { id: string; name: string; parts: string[]; used?: number; suggested?: boolean }

export function MergeView() {
  const profiles = useProfilesFull();
  const timeline = useTimeline(90);
  const rows: ProfileRow[] = profiles.data ?? [];
  const byName = new Map(rows.map((r) => [r.name, r]));

  const [q, setQ] = useState("");
  const [composite, setComposite] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [over, setOver] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse["preview"] | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const previewSeq = useRef(0);
  const seeded = useRef(false);

  // Seed saved groups (once) from the profiles you actually run, from cue
  // telemetry — real combinations, most-used first — plus a couple of suggested
  // combos built from your top single profiles. Replaces the old hardcoded
  // gstack-stack/baseline examples. Parts are filtered to profiles that still
  // exist on disk so a renamed/removed profile doesn't leave a dead chip.
  useEffect(() => {
    if (seeded.current || !rows.length || !timeline.data) return;
    seeded.current = true;
    const have = (n: string) => byName.has(n);
    const key = (p: string[]) => [...p].sort().join("+");
    const used = [...(timeline.data.profiles ?? [])].sort((a, b) => b.sessions - a.sessions);
    const seen = new Set<string>();

    const localGroups: Group[] = [];
    for (const u of used) {
      if (!u.profile.includes("+")) continue;
      const parts = u.profile.split("+").filter(have);
      if (parts.length < 2) continue;
      const k = key(parts);
      if (seen.has(k)) continue;
      seen.add(k);
      localGroups.push({ id: "u" + localGroups.length, name: u.profile, parts, used: u.sessions });
      if (localGroups.length >= 6) break;
    }

    // Suggested combos: pair your two most-used single profiles, plus a couple
    // of sensible stacks — skipping any that you already run.
    const topSingles = used.filter((u) => !u.profile.includes("+") && have(u.profile)).map((u) => u.profile);
    const combos: Group[] = [];
    const suggest = (parts: string[]) => {
      const ps = parts.filter(have);
      if (ps.length < 2) return;
      const k = key(ps);
      if (seen.has(k)) return;
      seen.add(k);
      combos.push({ id: "c" + combos.length, name: ps.join("+"), parts: ps, suggested: true });
    };
    if (topSingles.length >= 2) suggest([topSingles[0]!, topSingles[1]!]);
    suggest(["gstack", "skill-writer"]);
    suggest(["coolify", "designer"]);

    const all = [...localGroups, ...combos].slice(0, 8);
    if (all.length) { setGroups(all); setActive(all[0]!.id); }
  }, [rows, timeline.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live deduped stats from the merge engine (≥2 parts). Debounced; the
  // sequence guard drops stale responses when parts change quickly.
  useEffect(() => {
    if (composite.length < 2) { setPreview(null); setPreviewErr(null); return; }
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await postJson<PreviewResponse>("/merge/preview", { names: composite });
        if (seq === previewSeq.current) { setPreview(res.preview); setPreviewErr(null); }
      } catch (e) {
        if (seq === previewSeq.current) { setPreview(null); setPreviewErr((e as Error).message); }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [composite]);

  const filtered = rows.filter((r) => !q || r.name.includes(q.toLowerCase()));

  const onDragStart = (e: React.DragEvent, name: string) => { e.dataTransfer.setData("text/plain", name); e.dataTransfer.effectAllowed = "copy"; };
  const allowDrop = (e: React.DragEvent, id: string) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (over !== id) setOver(id); };
  const leave = (id: string) => { if (over === id) setOver(null); };
  const flash = (id: string) => { setPulse(id); setTimeout(() => setPulse(null), 450); };

  const addToComposite = (name: string) => { if (!name) return; setComposite((c) => (c.includes(name) ? c : [...c, name])); flash("composite"); };
  const addToGroup = (gid: string, name: string) => { if (!name) return; setGroups((gs) => gs.map((g) => (g.id === gid && !g.parts.includes(name) ? { ...g, parts: [...g.parts, name] } : g))); flash(gid); };
  const renameGroup = (gid: string, name: string) => setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, name } : g)));
  const deleteGroup = (gid: string) => { setGroups((gs) => gs.filter((g) => g.id !== gid)); if (active === gid) setActive(null); };
  const removeFromGroup = (gid: string, name: string) => setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, parts: g.parts.filter((p) => p !== name) } : g)));

  // Quick client-side sum for the local group presets (not a real merge).
  const approx = (parts: string[]) => {
    let skills = 0, mcps = 0, plugins = 0;
    for (const p of parts) { const r = byName.get(p); if (r) { skills += r.skills + r.npx; mcps += r.mcps; plugins += r.plugins; } }
    return { skills: parts.length > 1 ? Math.round(skills * 0.82) : skills, mcps, plugins };
  };

  const saveComposite = async () => {
    if (composite.length < 2) return;
    const suggested = composite.slice(0, 2).join("-") + (composite.length > 2 ? "-plus" : "");
    const name = window.prompt("Save merged profile as (lowercase-kebab):", suggested);
    if (!name) return;
    setSaveMsg("saving…");
    try {
      const res = await postJson<{ path: string; created: boolean }>("/merge/save", { names: composite, name, mode: "static" });
      setSaveMsg(`${res.created ? "created" : "updated"} ${res.path}`);
      setGroups((gs) => [{ id: "g" + Date.now(), name, parts: [...composite] }, ...gs]);
      profiles.refetch();
    } catch (e) {
      setSaveMsg("error: " + (e as Error).message);
    }
  };

  // Composite display stats — real preview when available, else a sum.
  const ap = approx(composite);
  const skillsN = preview ? preview.skills.length : ap.skills;
  const mcpsN = preview ? preview.mcps.length : ap.mcps;
  const pluginsN = preview ? preview.plugins.length : ap.plugins;
  const estTokens = preview ? (preview.estTokens / 1000).toFixed(1) : null;
  const collisions = preview ? preview.skillConflicts.length : 0;

  return (
    <div className="mergepage">
      <div className="page-head">
        <div>
          <div className="page-title">🧬 Merge studio</div>
          <div className="page-sub">Drag profiles into a composite to combine them — live deduped stats from the merge engine. Save writes a real <code>profiles/&lt;name&gt;</code>.</div>
        </div>
        <div className="mcp-summary">
          <StatBig n={rows.length} l="profiles" />
          <StatBig n={groups.length} l="saved groups" accent="violet" />
          <StatBig n={composite.length} l="in composer" accent="green" />
        </div>
      </div>

      <div className="merge-grid">
        {/* palette */}
        <div className="palette">
          <div className="tree-filter" style={{ margin: 0 }}>
            <span className="tf-ico">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter profiles…" spellCheck={false} />
            {q && <span className="tf-clear" onClick={() => setQ("")}>×</span>}
          </div>
          <div className="pal-hint">drag a card →</div>
          <div className="pal-list">
            {filtered.map((r) => (
              <div key={r.name} className="block" draggable onDragStart={(e) => onDragStart(e, r.name)} onDoubleClick={() => addToComposite(r.name)}>
                <span className="bl-emoji">
                  {r.iconImage
                    ? <img src={`/api/v1/profile-icon?profile=${encodeURIComponent(r.name)}`} alt="" width={24} height={24}
                        style={{ objectFit: "contain", borderRadius: 5 }}
                        onError={(e) => { (e.currentTarget.style.display = "none"); const sib = e.currentTarget.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = ""; }} />
                    : null}
                  <span style={r.iconImage ? { display: "none" } : undefined}>{r.icon || partEmoji(r.name)}</span>
                </span>
                <div className="bl-mid">
                  <div className="bl-name">{r.name}</div>
                  <div className="bl-meta">{r.skills + r.npx} sk{r.mcps ? ` · ${r.mcps} mcp` : ""}{r.plugins ? ` · ${r.plugins} plug` : ""}</div>
                </div>
                <span className="bl-grip">⋮⋮</span>
              </div>
            ))}
            {!rows.length && <div className="bl-meta" style={{ padding: 8 }}>loading profiles…</div>}
          </div>
        </div>

        {/* main */}
        <div className="merge-main">
          <div className="composer">
            <div className="comp-top">
              <div className="comp-title">New composite</div>
              <div className="comp-sub">{composite.length} profile{composite.length !== 1 ? "s" : ""}{preview ? " · live preview" : previewErr ? " · approx" : ""}</div>
            </div>
            <div className={"comp-drop" + ((over === "composite" || pulse === "composite") ? " over" : "")}
              onDragOver={(e) => allowDrop(e, "composite")} onDragLeave={() => leave("composite")}
              onDrop={(e) => { e.preventDefault(); setOver(null); addToComposite(e.dataTransfer.getData("text/plain")); }}>
              {composite.length === 0
                ? <div className="comp-empty">⊕ &nbsp;Drag profiles here to merge</div>
                : composite.map((p) => <PartChip key={p} name={p} onRemove={() => setComposite((c) => c.filter((x) => x !== p))} />)}
            </div>

            <div className="comp-summary">
              <div className="cs-stat"><div className="n">{skillsN}</div><div className="l">SKILLS</div></div>
              <div className="cs-stat"><div className="n">{mcpsN}</div><div className="l">MCPS</div></div>
              <div className="cs-stat"><div className="n">{pluginsN}</div><div className="l">PLUGINS</div></div>
              <div className="cs-stat"><div className="n warn">{estTokens ? `~${estTokens}K` : "—"}</div><div className="l">EST TOKENS</div></div>
              <div className="cs-stat">{collisions
                ? <><div className="n" style={{ color: "var(--red)" }}>{collisions}</div><div className="l">COLLISION{collisions !== 1 ? "S" : ""}</div></>
                : <><div className="n" style={{ color: "var(--green)" }}>0</div><div className="l">CLEAN</div></>}</div>
            </div>
            {collisions > 0 && preview && (
              <div className="cs-collide">⚠ {collisions} slug collision{collisions !== 1 ? "s" : ""} — e.g. <b>{preview.skillConflicts[0]!.skillA}</b> vs <b>{preview.skillConflicts[0]!.skillB}</b></div>
            )}
            {previewErr && <div className="cs-collide">preview unavailable ({previewErr}) — showing an approximate sum</div>}

            <div className="comp-actions">
              <button className="btn primary" disabled={composite.length < 2} onClick={saveComposite}>＋ Save as profile</button>
              <button className="btn" disabled={!composite.length} onClick={() => setComposite([])}>Clear</button>
              {saveMsg && <span className="comp-sub" style={{ alignSelf: "center" }}>{saveMsg}</span>}
            </div>
          </div>

          <div className="groups-head">
            <div className="card-title" style={{ fontSize: 14 }}>Saved groups <span className="ct-muted">({groups.length})</span></div>
            <span className="seg-link">★ = profiles you actually run (cue telemetry) · drop a profile on a card to add it</span>
          </div>
          <div className="groups-grid">
            {groups.map((g) => {
              const st = approx(g.parts);
              const on = active === g.id;
              return (
                <div key={g.id} className={"group-card" + ((over === g.id || pulse === g.id) ? " over" : "") + (on ? " active" : "")}
                  onDragOver={(e) => allowDrop(e, g.id)} onDragLeave={() => leave(g.id)}
                  onDrop={(e) => { e.preventDefault(); setOver(null); addToGroup(g.id, e.dataTransfer.getData("text/plain")); }}
                  onClick={() => setActive(g.id)}>
                  <div className="gc-head">
                    <span className="gc-dot" style={{ background: on ? "#3ecf8e" : "#3a3f4a" }}></span>
                    <input className="gc-name-input" value={g.name} spellCheck={false} onClick={(e) => e.stopPropagation()} onChange={(e) => renameGroup(g.id, e.target.value)} />
                    {g.used != null
                      ? <span className="gc-badge" style={{ color: "var(--green)", borderColor: "#1f4a37", background: "#0f1d17" }} title="runs in the last 90 days">★ {g.used}×</span>
                      : g.suggested
                        ? <span className="gc-badge" style={{ color: "var(--violet)" }}>suggested</span>
                        : <span className="gc-badge">{g.parts.length} parts</span>}
                    <span className="gc-del" title="delete group" onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}>✕</span>
                  </div>
                  <div className="gc-parts">
                    {g.parts.map((p) => <PartChip key={p} name={p} onRemove={() => removeFromGroup(g.id, p)} />)}
                  </div>
                  <div className="gc-stats">
                    <span><b>~{st.skills}</b> skills</span>
                    <span><b>{st.mcps}</b> mcps</span>
                    <span><b>{st.plugins}</b> plug</span>
                  </div>
                </div>
              );
            })}
            <div className="group-card add-group" onClick={saveComposite} title="Save current composite as a real profile">
              <div className="ag-plus">＋</div>
              <div className="ag-t">Save composite as profile</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
