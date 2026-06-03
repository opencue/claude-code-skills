/**
 * Settings / preferences. Toggles persist to localStorage; the accent swatch
 * recolors the whole UI live (and on reload, via StudioApp). Ported from
 * studio-settings.jsx. The default-profile list is live from /profiles/full.
 */

import { useEffect, useState } from "react";

import { useProfilesFull } from "../api";

const KEY = "cue-studio-settings";
interface Settings {
  theme: string; accent: string; density: string; defaultView: string;
  wrap: boolean; minimap: boolean; lineNumbers: boolean; defaultProfile: string;
  budget: number; telemetry: boolean; crash: boolean;
}
const DEF: Settings = {
  theme: "dark", accent: "#8b7bf0", density: "comfortable", defaultView: "preview",
  wrap: false, minimap: true, lineNumbers: true, defaultProfile: "",
  budget: 7, telemetry: true, crash: true,
};
function load(): Settings {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEF }; }
}
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  r = Math.round(r + (pct < 0 ? r : 255 - r) * f);
  g = Math.round(g + (pct < 0 ? g : 255 - g) * f);
  b = Math.round(b + (pct < 0 ? b : 255 - b) * f);
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button className={"st-toggle" + (on ? " on" : "")} onClick={onClick}><span className="st-knob"></span></button>;
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return <div className="st-seg">{options.map((o) => <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>{o.l}</button>)}</div>;
}
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return <div className="st-row"><div className="st-rl"><div className="st-rlabel">{label}</div>{desc && <div className="st-rdesc">{desc}</div>}</div><div className="st-rc">{children}</div></div>;
}
function Sec({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return <div className="st-block"><div className="st-sec">{icon} {title}</div><div className="st-card">{children}</div></div>;
}

const ACCENTS = ["#8b7bf0", "#5b9cf0", "#3ecf8e", "#e0913a", "#e3596a", "#d46fb0"];

export function SettingsView() {
  const profiles = useProfilesFull();
  const [s, setS] = useState<Settings>(load);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }, [s]);
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--violet", s.accent);
    r.style.setProperty("--violet-d", shade(s.accent, -20));
  }, [s.accent]);

  return (
    <div className="mcpage settings">
      <div className="page-head">
        <div>
          <div className="page-title">⚙ Settings</div>
          <div className="page-sub">Preferences for cue studio. Changes save automatically.</div>
        </div>
        <button className="st-reset" onClick={() => setS({ ...DEF })}>Reset to defaults</button>
      </div>

      <Sec icon="🎨" title="Appearance">
        <Row label="Theme" desc="Base color scheme for the workspace.">
          <Seg value={s.theme} onChange={(v) => set("theme", v)} options={[{ v: "dark", l: "Dark" }, { v: "dim", l: "Dim" }, { v: "midnight", l: "Midnight" }]} />
        </Row>
        <Row label="Accent color" desc="Used for highlights, the active state, and the brand mark.">
          <div className="st-swatches">
            {ACCENTS.map((c) => <button key={c} className={"st-sw" + (s.accent === c ? " on" : "")} style={{ background: c, color: c }} onClick={() => set("accent", c)}></button>)}
          </div>
        </Row>
        <Row label="Density" desc="Row height across lists and trees.">
          <Seg value={s.density} onChange={(v) => set("density", v)} options={[{ v: "comfortable", l: "Comfortable" }, { v: "compact", l: "Compact" }]} />
        </Row>
      </Sec>

      <Sec icon="📝" title="Editor">
        <Row label="Open files in" desc="Default mode when opening a README.">
          <Seg value={s.defaultView} onChange={(v) => set("defaultView", v)} options={[{ v: "preview", l: "Preview" }, { v: "edit", l: "Edit" }]} />
        </Row>
        <Row label="Word wrap" desc="Wrap long lines instead of scrolling."><Toggle on={s.wrap} onClick={() => set("wrap", !s.wrap)} /></Row>
        <Row label="Minimap" desc="Show the code minimap on the right edge."><Toggle on={s.minimap} onClick={() => set("minimap", !s.minimap)} /></Row>
        <Row label="Line numbers" desc="Show the gutter line numbers."><Toggle on={s.lineNumbers} onClick={() => set("lineNumbers", !s.lineNumbers)} /></Row>
      </Sec>

      <Sec icon="🧩" title="Workspace">
        <Row label="Default profile" desc="Profile loaded when cue studio starts.">
          <select className="st-select" value={s.defaultProfile} onChange={(e) => set("defaultProfile", e.target.value)}>
            <option value="">(active / cwd)</option>
            {(profiles.data ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Overhead budget" desc="Warn when always-on skill overhead exceeds this.">
          <div className="st-range-wrap">
            <input className="st-range" type="range" min="3" max="16" step="1" value={s.budget} onChange={(e) => set("budget", +e.target.value)} />
            <span className="st-range-v">~{s.budget}.0K</span>
          </div>
        </Row>
      </Sec>

      <Sec icon="🔒" title="Privacy">
        <Row label="Telemetry" desc="Send anonymized usage stats to improve cue."><Toggle on={s.telemetry} onClick={() => set("telemetry", !s.telemetry)} /></Row>
        <Row label="Crash reports" desc="Automatically report crashes."><Toggle on={s.crash} onClick={() => set("crash", !s.crash)} /></Row>
      </Sec>

      <Sec icon="ℹ" title="About">
        <div className="st-about">
          <div className="st-about-mark"><b>cue</b><span>studio</span></div>
          <div className="st-about-meta">
            <div>cue studio · the cue profile manager IDE</div>
            <div className="st-about-links"><a>Release notes</a><span>·</span><a>Documentation</a><span>·</span><a>License</a></div>
          </div>
          <button className="btn">Check for updates</button>
        </div>
      </Sec>
    </div>
  );
}
