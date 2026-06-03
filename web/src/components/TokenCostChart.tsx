import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetcher } from "../lib/fetcher";

interface ProfilesData {
  // From /api/v1/profiles: [{ name, claudeMdBytes }]
  name: string;
  claudeMdBytes: number | null;
}

export function TokenCostChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => fetcher<ProfilesData[]>("/profiles"),
  });

  if (isLoading) {
    return <Card><div className="empty">Loading…</div></Card>;
  }
  if (!data) return null;

  // Top 10 materialized profiles by CLAUDE.md size — these are where any
  // future compaction work pays off most.
  const rows = data
    .filter((r) => r.claudeMdBytes != null && r.claudeMdBytes > 0)
    .sort((a, b) => (b.claudeMdBytes ?? 0) - (a.claudeMdBytes ?? 0))
    .slice(0, 10)
    .map((r) => ({ name: r.name, tokens: Math.round((r.claudeMdBytes ?? 0) / 4) }));

  if (rows.length === 0) {
    return (
      <Card>
        <Header title="Token cost per profile" cta="cue list --json" />
        <div className="empty">No materialized profiles yet. Launch one with <code>cue launch</code>.</div>
      </Card>
    );
  }

  // Highlight any profile above 4k tokens (rule of thumb: above this you
  // probably have zombie skills to prune).
  const max = Math.max(...rows.map((r) => r.tokens));

  return (
    <Card>
      <Header title="Token cost per profile (CLAUDE.md, materialized)" cta="cue list --json" />
      <div style={{ width: "100%", height: Math.max(200, rows.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} stroke="var(--border)" />
            <YAxis dataKey="name" type="category" width={180} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} stroke="var(--border)" />
            {/* 4k "zombie skills" rule-of-thumb threshold — was only in prose. */}
            {max > 4000 && (
              <ReferenceLine
                x={4000}
                stroke="var(--text-dim)"
                strokeDasharray="3 3"
                label={{ value: "4k", position: "top", fill: "var(--text-dim)", fontSize: 10 }}
              />
            )}
            <Tooltip
              cursor={{ fill: "var(--accent-soft)" }}
              contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
              formatter={(value: number) => `${value.toLocaleString()} tokens`}
            />
            <Bar dataKey="tokens" radius={[0, 3, 3, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.tokens > max * 0.7 ? "var(--red)" : "var(--accent)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
        Profiles above 4k tokens usually have zombie skills.{" "}
        <code className="card-cta">cue skill-report --all</code>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) { return <section className="card">{children}</section>; }
function Header({ title, cta }: { title: string; cta: string }) {
  return (
    <div className="card-header">
      <span className="card-title">{title}</span>
      <code className="card-cta">{cta}</code>
    </div>
  );
}
