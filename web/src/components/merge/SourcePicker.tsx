import { useMemo } from "react";
import type { ProfileRow } from "../../lib/fetcher";
import { SEED_BUCKETS } from "../../data/seed-buckets";

interface Props {
  profiles: ProfileRow[];
  selected: Set<string>;
  conflictNames: Set<string>;
  onToggle: (name: string) => void;
}

/**
 * Full profile list, grouped by the 8 recommended buckets (plus an "other"
 * group for profiles no bucket claims). Multiselect; rows that conflict with
 * the current selection are greyed and disabled.
 */
export function SourcePicker({ profiles, selected, conflictNames, onToggle }: Props) {
  const byName = useMemo(() => new Map(profiles.map((p) => [p.name, p])), [profiles]);

  // Which profiles a bucket claims (only ones that exist).
  const claimed = new Set<string>();
  const groups = SEED_BUCKETS.map((b) => {
    const rows = b.members.map((m) => byName.get(m)).filter(Boolean) as ProfileRow[];
    rows.forEach((r) => claimed.add(r.name));
    return { label: `${b.icon} ${b.name}`, rows };
  });
  const other = profiles
    .filter((p) => !claimed.has(p.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (other.length) groups.push({ label: "· other", rows: other });

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">Source profiles</span>
        <span className="card-cta">{selected.size} selected</span>
      </div>
      <div className="picker-scroll">
        {groups.map((g) => (
          <div key={g.label} className="picker-group">
            <div className="picker-group-label">{g.label}</div>
            {g.rows.map((p) => {
              const isSel = selected.has(p.name);
              // A profile that failed to resolve can't be merged: block it and
              // surface the reason on hover instead of showing it as 0 sk · 0 mcp.
              const failed = Boolean(p.error);
              const blocked = failed || (!isSel && conflictNames.has(p.name));
              return (
                <label
                  key={p.name}
                  className={`picker-row${isSel ? " sel" : ""}${blocked ? " blocked" : ""}`}
                  title={failed ? `Failed to load: ${p.error}` : blocked ? "Conflicts with a selected profile" : p.description}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={blocked}
                    onChange={() => onToggle(p.name)}
                  />
                  <span className="picker-name">{failed ? "⚠" : p.icon ?? "•"} {p.name}</span>
                  <span className="picker-meta dim">{failed ? "failed to load" : `${p.skills} sk · ${p.mcps} mcp`}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
