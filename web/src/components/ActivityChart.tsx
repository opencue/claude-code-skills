/**
 * Sessions-over-time area chart. Renders the gap-filled daily activity from
 * /telemetry/timeline — the endpoint existed but nothing drew it. Themed per
 * DESIGN.md: single accent series, hairline axes, mono tooltip, no chartjunk.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetcher } from "../lib/fetcher";

interface TimelineData {
  windowDays: number;
  daily: { date: string; sessions: number }[];
  profiles: { profile: string; sessions: number; lastUsed: string | null }[];
}

const WINDOWS = [7, 30, 90] as const;

export function ActivityChart() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ["timeline", days],
    queryFn: () => fetcher<TimelineData>(`/telemetry/timeline?since=${days}`),
  });

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Activity over time</span>
        <div className="row" style={{ gap: 10 }}>
          <div className="seg">
            {WINDOWS.map((w) => (
              <button
                key={w}
                className={`seg-btn ${days === w ? "on" : ""}`}
                onClick={() => setDays(w)}
              >
                {w}d
              </button>
            ))}
          </div>
          <code className="card-cta">cue stats</code>
        </div>
      </div>

      {isLoading ? (
        <div className="empty">Loading activity…</div>
      ) : error ? (
        <div className="empty">{(error as Error).message}</div>
      ) : !data || data.daily.every((d) => d.sessions === 0) ? (
        <div className="empty">
          No sessions recorded in the last {days}d. Launch one with{" "}
          <code>cue launch claude</code> — activity needs telemetry enabled.
        </div>
      ) : (
        <>
          <div className="activity-summary">
            <span className="big mono">
              {data.daily.reduce((a, d) => a + d.sessions, 0).toLocaleString()}
            </span>
            <span className="dim"> sessions · last {days}d</span>
          </div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--text-dim)", fontSize: 10 }}
                  stroke="var(--border)"
                  tickFormatter={(d: string) => d.slice(5)}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  width={28}
                  tick={{ fill: "var(--text-dim)", fontSize: 10 }}
                  stroke="var(--border)"
                />
                <Tooltip
                  cursor={{ stroke: "var(--border-hover)" }}
                  contentStyle={{
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  formatter={(v: number) => [`${v} session${v === 1 ? "" : "s"}`, ""]}
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  fill="url(#activityFill)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
