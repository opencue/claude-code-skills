/**
 * Workflows gallery — the active profile's playbooks, rendered as ordered
 * pipelines. Each card is one playbook from resources/playbooks/; each step is
 * a `##` section of that doc. Sourced live from /profile-detail (the `playbooks`
 * field). Expand a card for per-step detail; ▶ run animates the pipeline.
 *
 * While the endpoint loads (or for a profile that declares no playbooks) we
 * fall back to the curated starter set in ../curated.ts so the page is never
 * blank — that set is clearly the placeholder, not the source of truth.
 */

import { useEffect, useRef, useState } from "react";

import { useProfileDetail, type PlaybookStep, type PlaybookWorkflow } from "../api";
import { WORKFLOWS } from "../curated";

// Steps come from prose headings, not the skill catalogue, so they're coloured
// by position rather than namespace — a stable rainbow down the pipeline.
const STEP_PALETTE = ["#8b7bf0", "#5ec8c8", "#e0a458", "#d36b9a", "#6aa9e0", "#7bc47f", "#c264c2", "#e07a5f"];
const stepColor = (i: number) => STEP_PALETTE[i % STEP_PALETTE.length]!;

/** Curated starter templates → playbook-card shape, for the loading fallback. */
const FALLBACK: PlaybookWorkflow[] = WORKFLOWS.map((w) => ({
  id: w.id, name: w.name, title: w.name, emoji: w.emoji, trigger: w.trigger,
  est: w.est, desc: w.desc,
  steps: w.steps.map((s) => ({ name: s.name, detail: s.kind === "command" ? "slash command" : "" })),
}));

function StatBig({ n, l, accent }: { n: React.ReactNode; l: string; accent?: string }) {
  return <div className="statbig"><div className={"sb-n" + (accent ? " " + accent : "")}>{n}</div><div className="sb-l">{l}</div></div>;
}

function WfCard({ wf, expanded, onToggle }: {
  wf: PlaybookWorkflow; expanded: boolean; onToggle: () => void;
}) {
  const [run, setRun] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timer.current) clearInterval(timer.current);
    setRun(0);
    let i = 0;
    timer.current = setInterval(() => {
      i++;
      if (i >= wf.steps.length) { if (timer.current) clearInterval(timer.current); setTimeout(() => setRun(-1), 900); }
      else setRun(i);
    }, 750);
  };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const running = run >= 0;
  const stepDesc = (s: PlaybookStep) => s.detail || "step in this playbook";
  return (
    <div className={"wf-card" + (expanded ? " open" : "")} onClick={onToggle}>
      <div className="wf-head">
        <div className="wf-emoji">{wf.emoji}</div>
        <div className="wf-title">
          <div className="wf-name" title={wf.title}>{wf.name}</div>
          <div className="wf-badges">
            <span className="wf-trig">{wf.trigger}</span>
            <span className="wf-meta">{wf.steps.length} steps · {wf.est}</span>
          </div>
        </div>
        <button className={"wf-run" + (running ? " on" : "")} onClick={start}>{running ? "running…" : "▶ run"}</button>
        <span className="wf-chev">{expanded ? "▾" : "▸"}</span>
      </div>
      <div className="wf-desc">{wf.desc}</div>

      <div className="wf-steps">
        {wf.steps.map((s, i) => {
          const c = stepColor(i);
          const state = running ? (i < run ? "done" : i === run ? "active" : "pending") : "";
          return (
            <span key={i} style={{ display: "contents" }}>
              <span className={"wf-step " + state} style={{ "--sc": c } as React.CSSProperties}>
                <span className="ws-idx">{state === "done" ? "✓" : i + 1}</span>
                <span className="ws-dot" style={{ background: c }}></span>
                <span className="ws-name">{s.name}</span>
              </span>
              {i < wf.steps.length - 1 && <span className={"wf-arrow" + (running && i < run ? " lit" : "")}>→</span>}
            </span>
          );
        })}
      </div>

      {expanded && (
        <div className="wf-pipeline" onClick={(e) => e.stopPropagation()}>
          {wf.steps.map((s, i) => (
            <div className="wf-prow" key={i}>
              <span className="wp-rail"><span className="wp-node" style={{ background: stepColor(i) }}></span></span>
              <div className="wp-body">
                <div className="wp-name">{s.name}<span className="wp-kind">step {i + 1}</span></div>
                <div className="wp-desc">{stepDesc(s)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowsView({ profile }: { profile?: string | null }) {
  const { data } = useProfileDetail(profile ?? undefined);
  const live = data?.playbooks ?? [];
  const list = live.length > 0 ? live : FALLBACK;
  // undefined = untouched (default the first card open); null = all closed.
  const [open, setOpen] = useState<string | null | undefined>(undefined);

  const totalSteps = list.reduce((a, w) => a + w.steps.length, 0);
  const avgSteps = list.length ? Math.round(totalSteps / list.length) : 0;
  const openId = open === undefined ? (list[0]?.id ?? null) : open;
  const toggle = (id: string) => setOpen(openId === id ? null : id);

  return (
    <div className="mcpage">
      <div className="page-head">
        <div>
          <div className="page-title">⚡ Workflows</div>
          <div className="page-sub">Your profile's playbooks — ordered, on-disk workflows. Each card is a playbook in <code>resources/playbooks/</code>; each step is one of its sections.</div>
        </div>
        <div className="mcp-summary">
          <StatBig n={list.length} l="workflows" />
          <StatBig n={totalSteps} l="total steps" accent="violet" />
          <StatBig n={avgSteps} l="avg steps" accent="green" />
        </div>
      </div>
      <div className="wf-grid">
        {list.map((w) => (
          <WfCard key={w.id} wf={w} expanded={openId === w.id} onToggle={() => toggle(w.id)} />
        ))}
        <div className="group-card add-group" style={{ minHeight: 96 }}>
          <div className="ag-plus">＋</div>
          <div className="ag-t">New workflow — chain skills into a pipeline</div>
        </div>
      </div>
    </div>
  );
}
