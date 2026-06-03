# cue dashboard — design system

> **Note (cue studio):** the active UI is now **cue studio**, a dark VS
> Code-style IDE with its own token set (IBM Plex Sans + JetBrains Mono,
> `--bg0..4`, `--violet` accent) defined in `src/studio/styles.css` — ported
> verbatim from the Claude Design handoff. The Vercel-flavored system below
> (Geist, `--accent` purple, `.app-grid` cards) describes the superseded
> 6-card dashboard and is kept for reference. When changing studio UI, match
> the tokens in `styles.css` and the recipes the prototype established.

A Vercel-flavored, content-first dark UI. The dashboard shows dense operational
data (profiles, sessions, skill activations, gaps), so the visual system favors
**legibility and hierarchy over decoration**. This doc is the contract: tokens,
type, spacing, and component recipes. Match it when adding or changing UI.

> Source of truth for tokens is `src/styles/globals.css` `:root`. This file
> explains *how* to use them. If you change a token, update both.

## Principles

1. **Data first, chrome last.** The numbers are the product. No gradients,
   shadows, or glassmorphism as decoration. Borders and spacing carry hierarchy.
2. **Monospace for data, sans for prose.** Counts, PIDs, tokens, file paths,
   CLI commands → `--mono` (Geist Mono). Labels, descriptions, headings →
   `--sans` (Geist).
3. **One accent, used sparingly.** Purple (`--accent`) marks the *active* / most
   important thing per view, not every interactive element. If everything is
   accented, nothing is.
4. **Semantic color only.** Green = healthy/live, red = error/over-budget,
   yellow = warning/demo. Never use them decoratively.
5. **Calm motion.** Transitions ≤150ms on color/border only. No layout-shifting
   animation; the dashboard refreshes data on intervals and must not jump.
6. **Every card earns its place.** A card states one thing and links to the CLI
   command that produces it (`card-cta`). No card without a takeaway.

## Color tokens

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#000000` | Page background |
| `--bg-elev` / `--bg-card` | `#0a0a0a` | Cards, raised surfaces |
| `--border` | `#1f1f1f` | Default 1px hairline |
| `--border-hover` | `#333333` | Card/control hover |
| `--text-primary` | `#ededed` | Headings, key numbers |
| `--text-secondary` | `#a1a1a1` | Body, labels |
| `--text-dim` | `#6b6b6b` | Captions, hints, table meta |
| `--accent` | `#8b5cf6` | The one important thing per view |
| `--accent-hover` | `#a78bfa` | Accent hover |
| `--accent-soft` | `rgba(139,92,246,.12)` | Accent fills/selection |
| `--green` | `#00e599` | Healthy, live, passing |
| `--red` | `#ff6166` | Error, failing, over-budget |
| `--yellow` | `#f5a623` | Warning, demo, stale |

Contrast: body text on card must clear WCAG AA (`#a1a1a1` on `#0a0a0a` ≈ 7:1 —
good). Never put `--text-dim` on `--bg-card` for anything a user must read; it's
for de-emphasis only.

## Typography

- **Fonts:** `--sans` = Geist; `--mono` = Geist Mono. Both already loaded.
- **Scale** (use these, don't invent sizes):

  | Role | size / weight | token-ish |
  |---|---|---|
  | Big stat number | 28px / 600 | stat tiles |
  | Card title | 13px / 600, `--text-secondary`, slight tracking | `.card-title` |
  | Body | 13px / 400, `--text-secondary` | default |
  | Label / caption | 11px / 500, `--text-dim`, uppercase tracking for section labels | `.tile-label` |
  | Data (mono) | 12–13px / 400 | PIDs, tokens, paths |

- **Numbers:** always `toLocaleString()` for counts ≥ 1000; abbreviate large
  token counts (`12.4k`, `1.2M`). Right-align numeric table columns (`.num`).

## Spacing & layout

- **Scale:** 4 · 8 · 12 · 16 · 24 · 32 (px). Card padding 16–20. Grid gap 16.
- **Card radius:** `--radius` (8px); inner controls `--radius-sm` (6px).
- **Grid:** `.app-grid` is the dashboard column. Full-width cards stack; use
  `.grid-row-pair` for two side-by-side cards (collapses to 1 column < 900px).
- **Density:** tables use 8px vertical cell padding; don't go tighter — dense ≠
  cramped.

## Component recipes

- **Card** (`.card`): `--bg-card`, 1px `--border`, `--radius`, 16–20 padding.
  Hover lifts border to `--border-hover` only. Always has a `.card-header` with
  a status `dot`, a `.card-title`, and a `.card-cta` (the CLI command, mono,
  dim, → accent on hover).
- **Stat tile** (`.stat-tile`): big mono number + uppercase dim label. Optional
  `.accent` / `.red` / `.green` class colors the number semantically.
- **Status dot** (`.dot`): 8px circle. `.green` live, `.yellow` warn,
  `.red` error. One per row/header to anchor scanning.
- **Badge** (`.badge`): pill, mono, 1px colored border, transparent fill.
  `.live` green, `.demo` yellow. Header-only.
- **Button** (actions like `stop`): ghost by default (transparent bg, 1px
  border, `--text-secondary`); hover raises border + text. Destructive actions
  (stop/kill) get `--red` text on hover, never a solid red fill. Disabled = 0.5
  opacity, no pointer.
- **Table** (`.table`): hairline row separators (`--border`), header row in
  `--text-dim` uppercase 11px. Numeric columns `.num` right-aligned + mono.
  Copyable cells (PID, cwd) get `.copyable` (cursor pointer + subtle hover).
- **Empty / error state** (`.empty`): centered, `--text-dim`, one sentence +
  the CLI command that would populate it. Never a blank card.

## Data visualization (recharts)

- **Theme:** axis/grid lines `--border`; tick labels `--text-dim` 11px mono;
  bars/areas use `--accent` (single series) or a semantic color when the value
  *means* something (red = over-budget). No default recharts palette.
- **No chartjunk:** drop the legend when there's one series; no 3D, no
  drop-shadows, no gradient fills heavier than `--accent-soft`.
- **Tooltips:** `--bg-elev` bg, 1px `--border`, mono numbers. Match card style.
- **Thresholds:** when a chart has a meaningful line (e.g. the 4k-token
  "zombie skills" mark), draw a dashed `--text-dim` ReferenceLine and label it.

## Do / Don't

- ✅ Lead each card with the single number/insight that matters.
- ✅ Link every card to its `cue` command (provenance + learnability).
- ✅ Use mono for anything a user might copy or compare digit-by-digit.
- ❌ No decorative gradients, glows, or shadows.
- ❌ No second accent color. Semantic green/red/yellow are not accents.
- ❌ No layout-shifting animation on the auto-refresh interval.
- ❌ No raw 13-digit numbers — localize/abbreviate.

## Current gaps (the "better design" backlog)

Tracked here so UI work has a target, not a vibe:

1. **Top stat row is flat** — 8 equal tiles, no hierarchy or trend. Add deltas /
   sparklines and group (health vs scale).
2. **No activity-over-time view** — `/api/v1/telemetry/timeline` exists but is
   unrendered. Add a sessions-over-time area/sparkline.
3. **Session duration unused** — `computeStats` exposes `avg_duration_s` /
   `total_duration_s`; surface "avg session length" and "time in profile".
4. **Token cost chart lacks the threshold line** — the 4k "zombie" mark is in
   prose, not on the chart. Add a `ReferenceLine`.
5. **Inconsistent empty/error states** — standardize on `.empty` + CLI hint.
