/**
 * Global command-palette search. Covers the WHOLE cue inventory, not just the
 * active profile: every skill in the active profile, every MCP in cue's catalog
 * (/mcps/catalog), every plugin installed on the machine (/plugins/discovered),
 * the profile's commands, and the workflow templates. Ranked + grouped +
 * highlighted, keyboard-driven.
 *
 * Opening a result routes to the right place: skills + connected mcps/plugins
 * open in the explorer; catalog-only mcps → MCPs view; other plugins → Plugins
 * view; workflows → Workflows view.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useProfileDetail, useMcpCatalog, useDiscoveredPlugins } from "../api";
import { nsColor, mcpInfo, WORKFLOWS } from "../curated";
import type { OpenTarget, View } from "../StudioApp";

type Kind = "skill" | "mcp" | "plugin" | "command" | "workflow";
interface Item {
  kind: Kind;
  key: string; name: string; desc: string;
  ns?: string; color?: string; emoji?: string;
  /** In the active profile (opens in the explorer) vs. only available in cue. */
  connected?: boolean;
}

function SHi({ text, q }: { text: string; q: string }): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="srhl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function score(name: string, desc: string, q: string): number {
  const n = name.toLowerCase(), d = (desc || "").toLowerCase(), s = q.toLowerCase();
  if (n === s) return 100;
  if (n.startsWith(s)) return 80;
  if (n.includes(s)) return 60;
  if (d.includes(s)) return 30;
  return 0;
}

export function SearchView({ profile, onOpen, setView }: {
  profile: string | null;
  onOpen: (kind: OpenTarget["kind"], key: string) => void;
  setView: (v: View) => void;
}) {
  const { data } = useProfileDetail(profile ?? undefined);
  const catalog = useMcpCatalog();
  const disc = useDiscoveredPlugins();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const ql = q.trim();

  const all: Item[] = useMemo(() => {
    const items: Item[] = [];

    // Skills — the active profile's resolved set.
    (data?.skills ?? []).forEach((s) => items.push({ kind: "skill", key: s.id, name: s.name, desc: s.desc, ns: s.ns, color: nsColor(s.ns), connected: true }));

    // MCPs — every server cue knows about: connected (in the profile) first,
    // then the rest of the catalog marked "available in cue".
    const connectedMcp = new Set((data?.mcps ?? []).map((m) => m.id));
    (data?.mcps ?? []).forEach((m) => items.push({ kind: "mcp", key: "mcp/" + m.id, name: m.id, desc: mcpInfo(m.id).desc || "MCP server · connected", emoji: mcpInfo(m.id).emoji, connected: true }));
    (catalog.data ?? []).forEach((e) => {
      if (connectedMcp.has(e.id)) return;
      items.push({ kind: "mcp", key: "cat/" + e.id, name: e.id, desc: e.description || "MCP server · available in cue", emoji: mcpInfo(e.id).emoji, connected: false });
    });

    // Plugins — every plugin installed on the machine (superset of the
    // profile's). Fall back to the profile's declared plugins if discovery is
    // unavailable (older server).
    const profilePlugins = new Set((data?.plugins ?? []).map((p) => p.id));
    const discList = disc.data?.plugins;
    if (discList && discList.length) {
      discList.forEach((p) => {
        const inProfile = profilePlugins.has(p.id);
        items.push({ kind: "plugin", key: inProfile ? "plugin/" + p.name : "disc/" + p.id, name: p.name, desc: p.description || (p.enabled ? "plugin · enabled" : "plugin · installed"), emoji: "🧩", connected: inProfile });
      });
    } else {
      (data?.plugins ?? []).forEach((p) => items.push({ kind: "plugin", key: "plugin/" + p.name, name: p.name, desc: "plugin · in profile", emoji: "🧩", connected: true }));
    }

    // Commands — the profile's slash commands.
    (data?.commands ?? []).forEach((c) => items.push({ kind: "command", key: "cmd/" + c.ref, name: c.name, desc: c.desc || "slash command", emoji: "›_" }));

    // Workflows — curated pipeline templates.
    WORKFLOWS.forEach((w) => items.push({ kind: "workflow", key: "wf/" + w.id, name: w.name, desc: w.desc, emoji: w.emoji }));

    return items;
  }, [data, catalog.data, disc.data]);

  const display = useMemo(() => {
    if (!ql) return all.map((it) => ({ ...it, _s: 0 }));
    return all.map((it) => ({ ...it, _s: score(it.name, it.desc, ql) })).filter((it) => it._s > 0)
      .sort((a, b) => b._s - a._s || a.name.length - b.name.length);
  }, [ql, all]);

  const showList = Boolean(ql) || scope !== "all";
  const scoped = display.filter((it) => scope === "all" || it.kind === scope.replace(/s$/, ""));
  const flat = showList ? scoped : [];
  useEffect(() => { setHi(0); }, [ql, scope]);

  const open = (it: Item) => {
    if (it.kind === "workflow") { setView("workflows"); return; }
    if (it.kind === "mcp" && !it.connected) { setView("mcps"); return; }
    if (it.kind === "plugin" && !it.connected) { setView("plugins"); return; }
    onOpen(it.kind as OpenTarget["kind"], it.key);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(flat.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[hi]) open(flat[hi]!); }
    else if (e.key === "Escape") { setQ(""); }
  };

  const cnt: Record<Kind, number> = { skill: 0, mcp: 0, plugin: 0, command: 0, workflow: 0 };
  all.forEach((i) => { cnt[i.kind]++; });
  const groups: [Kind, string][] = [["skill", "Skills"], ["mcp", "MCP servers"], ["plugin", "Plugins"], ["workflow", "Workflows"], ["command", "Commands"]];
  const scopes: [string, string, number][] = [
    ["all", "All", cnt.skill + cnt.mcp + cnt.plugin + cnt.workflow + cnt.command],
    ["skills", "Skills", cnt.skill], ["mcps", "MCPs", cnt.mcp],
    ["plugins", "Plugins", cnt.plugin], ["workflows", "Workflows", cnt.workflow],
    ["commands", "Commands", cnt.command],
  ];
  const flatIndex = (it: Item) => flat.indexOf(it as Item & { _s: number });
  const suggestions = (data?.skills ?? []).slice(0, 4);

  return (
    <div className="searchpage">
      <div className="search-wrap">
        <div className="search-box">
          <span className="sb-ico">⌕</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} spellCheck={false} placeholder="Search skills, MCPs, plugins, commands, workflows…" />
          {q && <span className="sb-clear" onClick={() => setQ("")}>esc</span>}
        </div>
        <div className="search-scopes">
          {scopes.map(([k, l, n]) => (
            <button key={k} className={"scope-chip" + (scope === k ? " on" : "")} onClick={() => setScope(k)}>{l}<span className="sc-n">{n}</span></button>
          ))}
        </div>

        {!showList ? (
          <div className="search-empty">
            <div className="se-h">Jump to</div>
            {suggestions.map((s) => (
              <div key={s.id} className="sr-row" onClick={() => onOpen("skill", s.id)}>
                <span className="sr-dot" style={{ background: nsColor(s.ns) }}></span>
                <div className="sr-mid"><div className="sr-name">{s.name}<span className="sr-tag" style={{ color: nsColor(s.ns) }}>{s.ns}</span></div><div className="sr-desc">{s.desc}</div></div>
                <span className="sr-badge">skill</span>
              </div>
            ))}
            <div className="se-tips"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> clear</span><span><kbd>⌘K</kbd> from anywhere</span></div>
          </div>
        ) : (
          <div className="search-results">
            <div className="sr-count">{ql ? `${flat.length} result${flat.length !== 1 ? "s" : ""}${scope !== "all" ? " in " + scope : ""} for “${ql}”` : `${scoped.length} ${scope}`}</div>
            {groups.map(([kind, label]) => {
              const rows = scoped.filter((it) => it.kind === kind);
              if (!rows.length) return null;
              return (
                <div key={kind} className="sr-group-block">
                  <div className="sr-group">{label} <span className="sg-n">{rows.length}</span></div>
                  {rows.map((it) => {
                    const idx = flatIndex(it); const on = idx === hi;
                    return (
                      <div key={it.key} className={"sr-row" + (on ? " on" : "")} onClick={() => open(it)} onMouseEnter={() => setHi(idx)}>
                        {it.kind === "skill" ? <span className="sr-dot" style={{ background: it.color }}></span> : <span className="sr-emoji">{it.emoji}</span>}
                        <div className="sr-mid">
                          <div className="sr-name"><SHi text={it.name} q={ql} />{it.kind === "skill" && <span className="sr-tag" style={{ color: it.color }}>{it.ns}</span>}</div>
                          <div className="sr-desc"><SHi text={it.desc} q={ql} /></div>
                        </div>
                        <span className="sr-right">
                          {it.kind !== "skill" && it.connected === false && <span className="sr-badge" style={{ color: "var(--fg3)" }}>available</span>}
                          {on && <span className="sr-enter">↵ open</span>}
                          <span className="sr-badge">{it.kind}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {scoped.length === 0 && (
              <div className="sr-none">{ql ? `No matches for “${ql}”. Try a different term or widen the scope.` : "Nothing here yet."}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
