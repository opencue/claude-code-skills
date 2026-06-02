/**
 * picker — interactive profile chooser.
 *
 * Two surfaces:
 *   - renderProfileList(): pure formatter (testable)
 *   - runPicker(): interactive TUI driven by @clack/prompts; opens stdin/stdout
 *
 * Picker writes the chosen profile to ./.cue-profile unless --no-pin is passed.
 * Cancel (esc / Ctrl-C) → exit code 130 (caller handles).
 */

import * as p from "@clack/prompts";
import { MultiSelectPrompt, Prompt, type PromptOptions } from "@clack/core";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";
import type { CompanionSignal } from "./companion-detect";
import { tokenLevelEmoji } from "./token-budget";
import type { UniversalSuggestion, UniversalOrigin } from "./pair-suggestions";

export interface PickerOption {
  value: string;
  label: string;
  hint: string;
  /** When true, sort this option above every other (used for the Default entry). */
  top?: boolean;
  /** When true, this is a non-selectable visual header. Selecting it re-prompts. */
  divider?: boolean;
  /**
   * Other profile `value`s that pair well with this one. Drives the post-pick
   * multiselect ("combine google-analytics with…"). Only names that resolve to
   * real options in the same list are offered.
   */
  recommends?: string[];
  /**
   * Other profile `value`s that are mutually exclusive with this one. In the
   * combine multiselect, checking this option auto-disables every conflict
   * (and vice versa). Used to stop e.g. medusa-vite + medusa-next being
   * stacked together.
   */
  conflicts?: string[];
  /**
   * Pre-check this option when the combine multiselect opens. Set by
   * launch.ts when cwd autodetection has high confidence in a recommended
   * partner (e.g. detect a Medusa storefront → auto-check medusa-vite).
   */
  preselect?: boolean;
}

/** Sentinel-value prefix used by divider options (see `divider`). */
export const DIVIDER_PREFIX = "__divider_";

export interface RenderOptions {
  cwd: string;
  includeFooter?: boolean;
}

export function renderProfileList(opts: PickerOption[], render: RenderOptions): string {
  const lines: string[] = [];
  lines.push(`▍cue · pick a profile for ${render.cwd}`);
  lines.push("");
  for (const opt of opts) {
    lines.push(`  ${opt.label.padEnd(14)} ${opt.hint}`);
  }
  if (render.includeFooter !== false) {
    lines.push("  ─────");
    lines.push("  + new profile from this cwd...");
    lines.push("  ⓘ details (d) · pick once, no pin (n) · cancel (esc)");
  }
  return lines.join("\n");
}

export interface PickerInput {
  cwd: string;
  options: PickerOption[];
  /** Skip writing .cue-profile if true. */
  noPin?: boolean;
  /**
   * Optional hook invoked after the user picks a profile (and pin confirm),
   * but before the outro line. Returned strings are emitted as `log.message`
   * inside the picker box, so they line up visually with the rest of the
   * prompt. Each string may contain its own newlines for multi-line entries.
   *
   * Failures inside the callback are caught and surfaced as a yellow warning
   * line — the picker still completes and returns the chosen profile.
   */
  details?: (profile: string) => Promise<string[]> | string[];
  /**
   * Pair affinity mined from local session history: for a given primary
   * profile, the list of partner profiles the user has frequently picked
   * alongside it. The combine multiselect surfaces these as additional
   * companion rows (beyond `recommends`) and pre-checks them.
   *
   * Keyed by primary profile `value`. Empty / missing keys = no historical
   * signal for that profile, fall back to recommends-only.
   */
  pairSuggestions?: Map<string, string[]>;
  /**
   * Raw cwd-autodetect results. The picker uses these to surface a
   * "switch profile?" nudge when the user's first pick has a conflict
   * with a profile the cwd actually matches (e.g. picked `medusa-next`
   * in a directory that has `vite.config.ts` → suggest `medusa-vite`).
   * The Suggested section already shows these as picker rows; this field
   * lets the post-pick nudge cite the reason that triggered the conflict.
   */
  detected?: ReadonlyArray<{ name: string; reasons: string[]; confidence: number }>;
  /**
   * Content-detected combine companions (see `lib/companion-detect`). Flat and
   * primary-independent: signals come from the cwd's contents (image/video
   * assets → higgsfield, markdown drafts → blog-writer, a registered brand
   * folder → postizz), not from which profile the user picks. Folded into the
   * combine multiselect alongside `recommends`/`pairSuggestions`; high-
   * confidence entries start checked. `buildCompanionOptions` drops any that
   * equal — or conflict with — the picked primary.
   */
  companions?: CompanionSignal[];
  /**
   * Cross-profile combine suggestions offered under *every* primary: the curated
   * featured set (where profiles like `improver` live) plus the user's
   * most-frequently-picked profiles, mined from session history (see
   * `buildUniversalSuggestions`). Folded into the combine multiselect after
   * recommends/history/detected, de-duped, and surfaced *unchecked* — a hint,
   * never an auto-pin. Empty/missing = recommends + universal-companion only.
   */
  universalSuggestions?: UniversalSuggestion[];
  /**
   * Optional resolver for a single profile value's own resources, used to drive
   * the combine multiselect's per-row "+N skills" hints and the live combined-
   * total preview. Called once per offered profile (primary + companions)
   * before the multiselect opens; failures degrade gracefully (that row simply
   * shows no counts). Omitted in tests → no preview, identical prior behavior.
   */
  resourceTally?: (profileValue: string) => Promise<ProfileTally> | ProfileTally;
}

export interface PickerOutput {
  profile: string;
  pinned: boolean;
}

// clack's built-in multiselect uses U+25FB/U+25FC squares for the toggle box,
// which render as blanks in some fonts under kitty/tmux — the user can't see
// what's on or off. This wraps @clack/core's MultiSelectPrompt with an ASCII
// render so the state is visible everywhere.
export type AsciiMSOption = {
  value: string;
  label: string;
  hint?: string;
  /** Mutually-exclusive value names. When any of these is already in the
   *  current selection, this option renders disabled and is stripped from
   *  the final result. Symmetric — a one-sided declaration blocks both. */
  conflicts?: string[];
  /** "action" rows (e.g. the skip-combine escape hatch) render distinct: no
   *  checkbox, a dim divider above, dim glyph when unselected. */
  kind?: "action";
  /** Primary profile's label, carried on the skip-combine action row so the
   *  live render can rebuild its text ("use X alone" ↔ "use X + Y") from the
   *  current selection instead of the static `label`. */
  primaryLabel?: string;
};

/**
 * Build a symmetric conflict map from a list of options. Declaring `A.conflicts
 * = [B]` on either side blocks both A→B and B→A so authors only have to write
 * the relationship once.
 */
function buildConflictMap(options: AsciiMSOption[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const o of options) {
    for (const c of o.conflicts ?? []) {
      if (!map.has(o.value)) map.set(o.value, new Set());
      map.get(o.value)!.add(c);
      if (!map.has(c)) map.set(c, new Set());
      map.get(c)!.add(o.value);
    }
  }
  return map;
}

/**
 * Resolve conflicts in a candidate selection. First-toggled wins: if A and
 * its conflict B are both in the list, the entry appearing later is dropped.
 * Used both by the live render (to mask blocked toggles) and at confirm time
 * (to guarantee the returned list never contains a conflict pair).
 */
export function resolveConflicts(
  selection: readonly string[],
  conflictMap: Map<string, Set<string>>,
): string[] {
  const out: string[] = [];
  for (const v of selection) {
    const blocked = out.some((kept) => conflictMap.get(kept)?.has(v));
    if (!blocked) out.push(v);
  }
  return out;
}

/** Sentinel for the combine multiselect's "use <primary> alone" escape hatch. */
export const SKIP_COMBINE = "__skip_combine__";

// Always-on combine companions (gstack) now flow through the single
// `buildUniversalSuggestions` path as the `pinned` origin — re-exported here so
// existing `import { UNIVERSAL_COMPANIONS } from "./picker"` call sites keep
// resolving. The canonical definition lives in `./pair-suggestions`.
export { UNIVERSAL_COMPANIONS } from "./pair-suggestions";

/** Hint shown on a row surfaced purely because it's a `_featured.yaml` pick. */
export const FEATURED_HINT = "featured";
/** Hint shown on a row surfaced purely from session pick-frequency. */
export const FREQUENT_HINT = "you use often";
/** Hint shown on a row surfaced purely as a `UNIVERSAL_COMPANIONS` pick. */
export const UNIVERSAL_HINT = "pairs with any stack";

/**
 * Confidence at/above which a content-detected companion starts checked in the
 * combine multiselect. Mirrors launch.ts's `SUGGESTED_AUTO_PICK_CONFIDENCE`
 * (kept as a local const so this lower-level module has no upward dependency).
 */
export const COMBINE_AUTO_CHECK_CONFIDENCE = 0.7;

/**
 * How many "you use often" (frequent-origin) rows start checked. Recents are
 * opt-out, but auto-ticking *every* frequent profile is what balloons a default
 * stack into a 20K-always-on monster — so only the top few (the list arrives
 * frequency-desc) start checked; the rest are offered unchecked.
 */
export const MAX_FREQUENT_AUTOCHECK = 3;

export interface BuildCompanionArgs {
  /** The picked primary profile. */
  primary: string;
  /** Display label for the "use <primary> alone" row. */
  primaryLabel: string;
  /** Full picker option list — source of each candidate's label/hint/conflicts. */
  options: PickerOption[];
  /** The primary's `recommends:` names. */
  recommends: string[];
  /** Historical partners for the primary (from session-log pair mining). */
  pairSuggested: string[];
  /** Content-detected companions for the cwd. */
  companions: CompanionSignal[];
  /** Confidence at/above which a detected companion starts checked. */
  autoCheckThreshold: number;
  /**
   * Featured + frequently-used cross-profile suggestions (see
   * `buildUniversalSuggestions`). Offered unchecked; a `featured`/`frequent`
   * origin only drives the row hint when the profile isn't already a
   * recommend/history/detected candidate.
   */
  universalSuggestions?: UniversalSuggestion[];
}

/**
 * Assemble the combine multiselect's rows + which start checked.
 *
 * Candidates = the primary's `recommends:` ∪ historical pairings ∪ content-
 * detected companions ∪ featured/frequently-used profiles ∪
 * `UNIVERSAL_COMPANIONS` (offered under every primary), de-duped by profile
 * (that order). A candidate is
 * dropped when it is the primary itself, a profile that conflicts with the
 * primary (either side of the declaration), a divider, a composite (`+`)
 * value, or not a real option. A detected candidate shows its reason as the
 * row hint (e.g. "12 image assets"). `initialValues` (start-checked) =
 * historical partners ∪ `preselect`-flagged options ∪ detected companions at/
 * above `autoCheckThreshold`. The trailing "use <primary> alone" action row is
 * appended only when at least one real companion survives.
 *
 * Pure: no I/O, no TTY. The live multiselect just renders the result.
 */
export function buildCompanionOptions(args: BuildCompanionArgs): {
  companionOptions: AsciiMSOption[];
  initialValues: string[];
} {
  const { primary, primaryLabel, options, recommends, pairSuggested, companions } = args;
  const universalSuggestions = args.universalSuggestions ?? [];
  const firstOpt = options.find((o) => o.value === primary);
  const primaryConflicts = new Set(firstOpt?.conflicts ?? []);
  // The primary may be a composite ("a+b+c"); every profile already inside it is
  // off the table as a companion — re-offering it (and, with recents auto-
  // checked, re-selecting it) is what duplicated profiles in the final selector.
  const primaryParts = new Set(primary.split("+"));
  const companionByName = new Map(companions.map((c) => [c.profile, c]));
  const pairSuggestedSet = new Set(pairSuggested);

  // Ordered, de-duped candidates with their origin: recommends → history →
  // detected → universal (featured/frequent/pinned, in that internal order).
  // Earlier (stronger) sources keep the slot and the row hint on overlap; the
  // origin drives the hint only for rows that appear *because* they're featured,
  // frequently used, or a pinned always-on companion (gstack).
  type CandidateOrigin = "recommends" | "history" | "detected" | UniversalOrigin;
  const candidates: Array<{ name: string; origin: CandidateOrigin }> = [];
  const seen = new Set<string>();
  const addCandidate = (name: string, origin: CandidateOrigin) => {
    if (seen.has(name)) return;
    seen.add(name);
    candidates.push({ name, origin });
  };
  for (const r of recommends) addCandidate(r, "recommends");
  for (const r of pairSuggested) addCandidate(r, "history");
  for (const c of companions) addCandidate(c.profile, "detected");
  // Featured + frequent + pinned (gstack) all arrive via the one universal path.
  for (const u of universalSuggestions) addCandidate(u.name, u.origin);

  const companionOptions: AsciiMSOption[] = [];
  const initialValues: string[] = [];
  let frequentChecked = 0;
  for (const { name, origin } of candidates) {
    if (primaryParts.has(name)) continue;
    if (primaryConflicts.has(name)) continue;
    const opt = options.find((o) => o.value === name);
    if (!opt || opt.divider === true || opt.value.includes("+")) continue;
    // Symmetric conflict: the candidate declares the primary as a conflict.
    if ((opt.conflicts ?? []).includes(primary)) continue;

    const detected = companionByName.get(name);
    // Detected rows show *why* they appeared; a featured/frequent-only row shows
    // its origin tag; everything else keeps the profile description.
    let hint = opt.hint;
    if (detected) hint = detected.reason;
    else if (origin === "featured") hint = FEATURED_HINT;
    else if (origin === "frequent") hint = FREQUENT_HINT;
    else if (origin === "pinned") hint = UNIVERSAL_HINT;
    companionOptions.push({
      value: opt.value,
      label: opt.label,
      hint,
      conflicts: opt.conflicts,
    });

    const checkByHistory = pairSuggestedSet.has(name);
    const checkByPreselect = opt.preselect === true;
    const checkByDetect = detected !== undefined && detected.confidence >= args.autoCheckThreshold;
    // Profiles you use often start checked — opt-out, not opt-in — but only the
    // top few (see MAX_FREQUENT_AUTOCHECK); beyond the cap they're offered
    // unchecked so a long recents tail can't auto-assemble a heavy stack.
    // Featured cross-sells never auto-check (a discovery hint, not a pin).
    const checkByFrequent = origin === "frequent" && frequentChecked < MAX_FREQUENT_AUTOCHECK;
    if (checkByHistory || checkByPreselect || checkByDetect || checkByFrequent) {
      initialValues.push(name);
      if (checkByFrequent) frequentChecked += 1;
    }
  }

  if (companionOptions.length > 0) {
    // Lead with the escape hatch so the cursor's first stop (index 0) is
    // "use <primary> alone": open the picker, press enter, launch the primary
    // by itself — no navigation. The combine rows follow below it.
    companionOptions.unshift({
      value: SKIP_COMBINE,
      label: `use ${primaryLabel} alone`,
      hint: "",
      kind: "action",
      primaryLabel,
    });
  }
  return { companionOptions, initialValues };
}

/**
 * A single profile's own resource identifiers, as lists so combined-profile
 * previews can union them exactly (a skill/mcp/plugin shared by two stacked
 * profiles is counted once). Skills mirror the picker headline: one entry per
 * local skill + one per npx repo.
 */
export interface ProfileTally {
  skills: string[];
  mcps: string[];
  plugins: string[];
  commands: string[];
  /**
   * This profile's own always-on token cost (skill-description frontmatter that
   * loads into the skill router every session). Optional — when present, the
   * combine preview sums it across the selection and soft-warns on a heavy
   * stack. Summing slightly overcounts skills shared by two companions, so the
   * displayed figure is an upper-bound estimate (rendered with a leading `~`).
   */
  alwaysOn?: number;
}

export interface TallyCounts {
  skills: number;
  mcps: number;
  plugins: number;
  commands: number;
}

const EMPTY_TALLY: ProfileTally = { skills: [], mcps: [], plugins: [], commands: [] };

/**
 * "+17 skills · +1 mcp" — the per-row hint showing what a companion adds.
 * Omits zero categories; returns "" for a profile that adds nothing. Pure.
 */
export function formatTallyDelta(t: ProfileTally): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`+${n} ${n === 1 ? one : many}`);
  };
  add(t.skills.length, "skill", "skills");
  add(t.mcps.length, "mcp", "mcps");
  add(t.plugins.length, "plugin", "plugins");
  add(t.commands.length, "cmd", "cmds");
  return parts.join(" · ");
}

/** Count of the de-duped union across several profile tallies. Pure. */
export function unionTallyCounts(tallies: ProfileTally[]): TallyCounts {
  const skills = new Set<string>();
  const mcps = new Set<string>();
  const plugins = new Set<string>();
  const commands = new Set<string>();
  for (const t of tallies) {
    for (const s of t.skills) skills.add(s);
    for (const m of t.mcps) mcps.add(m);
    for (const p of t.plugins) plugins.add(p);
    for (const c of t.commands) commands.add(c);
  }
  return { skills: skills.size, mcps: mcps.size, plugins: plugins.size, commands: commands.size };
}

/**
 * The live "what you're about to pin" line under the combine list. Each segment
 * reads `skills 31→48` when a companion changes the total, or `skills 31` when
 * it doesn't; zero-count categories are dropped. Returns [] when there's nothing
 * to show. Pure (no color) so it's directly testable.
 */
export function formatCombinedPreview(baseline: TallyCounts, combined: TallyCounts): string[] {
  const seg = (label: string, base: number, comb: number): string | null => {
    if (comb === 0) return null;
    return base === comb ? `${label} ${comb}` : `${label} ${base}→${comb}`;
  };
  const segs = [
    seg("skills", baseline.skills, combined.skills),
    seg("mcps", baseline.mcps, combined.mcps),
    seg("plugins", baseline.plugins, combined.plugins),
    seg("cmds", baseline.commands, combined.commands),
  ].filter((s): s is string => s !== null);
  return segs.length > 0 ? [segs.join("  ·  ")] : [];
}

/** Always-on token cost above which the combine preview soft-warns. Mirrors the
 *  🟠 band in `tokenLevelEmoji` — the point at which the agent's own perf
 *  warning starts to fire. */
export const OVERHEAD_WARN_TOKENS = 10_000;

/**
 * Soft-warning line for a heavy combined stack — "⚠ heavy: ~32k always-on 🔴 —
 * slows the agent". Returns "" below the warn threshold so light combos stay
 * uncluttered. The `~` flags it as an upper-bound estimate. Pure.
 */
export function formatOverheadBadge(alwaysOnTokens: number): string {
  if (alwaysOnTokens <= OVERHEAD_WARN_TOKENS) return "";
  const k =
    alwaysOnTokens >= 10_000
      ? String(Math.round(alwaysOnTokens / 1000))
      : (alwaysOnTokens / 1000).toFixed(1);
  return `⚠ heavy: ~${k}k always-on ${tokenLevelEmoji(alwaysOnTokens)} — slows the agent`;
}

/**
 * Whether to render profile icons in ASCII-safe mode. Emoji and Private-Use
 * glyphs (vite ⚡, nextjs ▲, vercel 🔺) show as tofu boxes in fonts that lack
 * them. We can't probe a font's glyph coverage from Node — only the locale — so
 * the env var `CUE_ASCII_ICONS=1` is the reliable opt-in; a non-UTF-8 locale
 * flips it on automatically. Default off (icons shown).
 */
export function asciiIconsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (/^(1|true|yes)$/i.test(env.CUE_ASCII_ICONS ?? "")) return true;
  const loc = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return loc !== "" && !/utf-?8/i.test(loc);
}

/**
 * Strip a leading icon cluster (emoji + variation selectors / ZWJ) from a label
 * when `ascii` is on, so "🔺 vercel" → "vercel". Pure-ASCII labels and labels
 * that are *entirely* non-ASCII (e.g. CJK names) are returned unchanged. Pure.
 */
export function stripIconIfAscii(label: string, ascii: boolean): string {
  if (!ascii) return label;
  const stripped = label.replace(/^[^\x00-\x7F]+\s*/u, "").trimStart();
  return stripped.length > 0 ? stripped : label;
}

/**
 * Collapse a profile combo to "first +N more" once it exceeds `max` parts, so
 * the confirm row never wraps. `<= max` parts render in full. Used for the
 * skip-combine action label, where the primary may itself be a composite
 * (`a + b + c`) and a handful of companions push the line off-screen. Pure.
 */
export function compressCombo(parts: string[], max = 3): string {
  if (parts.length <= max) return parts.join(" + ");
  return `${parts[0]} +${parts.length - 1} more`;
}

/**
 * Flatten composite picks (`"a+b"`) to their parts and drop duplicates,
 * preserving first-seen order. The combine picker's primary may already be a
 * composite, so a companion inside it — or one picked twice — must not double
 * up in the final selector, the runtime dir name, or the summary. Pure.
 */
export function dedupeSelectorParts(picks: string[]): string[] {
  const out: string[] = [];
  for (const pick of picks) {
    for (const part of pick.split("+")) {
      if (part.length > 0 && !out.includes(part)) out.push(part);
    }
  }
  return out;
}

/** State the combine multiselect frame is rendered from. Decoupled from the
 *  live @clack prompt so the frame is unit-testable without a TTY. */
export interface CombineFrameState {
  message: string;
  options: AsciiMSOption[];
  /** Index of the focused row. */
  cursor: number;
  /** Raw selected values, pre-conflict-resolution (the prompt's live value). */
  selected: string[];
  /** Per-row hints + live combined-total preview; omit for neither. */
  preview?: { primary: string; tallies: Map<string, ProfileTally> };
  /** Force ASCII icon mode. Defaults to `asciiIconsEnabled()`. */
  ascii?: boolean;
  /**
   * Max companion rows to show at once. When the companion list is longer it
   * scrolls around the cursor with "↑/↓ N more" markers (the action row, preview
   * and footer stay pinned). Unset / ≤0 → show every companion (no window).
   */
  maxRows?: number;
}

/**
 * Render one frame of the combine multiselect. Pure: same state in → same
 * string out, no TTY, no prompt object. `asciiMultiselect` delegates its live
 * render here so the displayed frame and the tested frame are the same code.
 *
 * `styleText` is a no-op when stdout isn't a TTY (as in tests), so assertions
 * match on plain text.
 */
export function renderCombineFrame(state: CombineFrameState): string {
  const BAR = styleText("gray", "│");
  const conflictMap = buildConflictMap(state.options);
  // Apply conflict resolution to the live value so the display matches what
  // we'd actually return on confirm. The underlying MultiSelectPrompt may hold
  // a conflicting value internally (we can't easily block its toggle), but the
  // user never sees it selected — and confirm strips it for real.
  const effective = new Set(resolveConflicts(state.selected, conflictMap));
  // Skip row on → primary-alone: the ticked companions are overridden, so they
  // count as nothing for the preview and footer tally.
  const skipping = effective.has(SKIP_COMBINE);
  const ascii = state.ascii ?? asciiIconsEnabled();
  const icon = (s: string) => stripIconIfAscii(s, ascii);
  const lines: string[] = [];
  lines.push(`${BAR}`);
  lines.push(`${BAR}  ${state.message}`);
  // One row's rendering, shared by the pinned action row and the windowed
  // companion list below it.
  const renderRow = (o: AsciiMSOption, idx: number) => {
    const isCursor = idx === state.cursor;
    const isSel = effective.has(o.value);
    const arrow = isCursor ? styleText("cyan", "›") : " ";

    if (o.kind === "action") {
      // Narrate what enter does *right now*: toggled on, this row forces
      // primary-alone (skips the checked companions); toggled off, it
      // mirrors the live combination so the confirm line never lies.
      const combo = [...effective]
        .filter((v) => v !== SKIP_COMBINE)
        .map((v) => icon(state.options.find((opt) => opt.value === v)?.label ?? v));
      // The primary may itself be a composite ("a + b + c"); split it so the
      // combo count is real and `compressCombo` can fold a long line to
      // "first +N more" instead of wrapping across the screen.
      const primaryParts = icon(o.primaryLabel ?? "").split(" + ");
      let dynamicLabel = o.label;
      if (o.primaryLabel) {
        dynamicLabel =
          isSel || combo.length === 0
            ? primaryParts.length <= 3
              ? `use ${icon(o.primaryLabel)} alone`
              : `use ${compressCombo(primaryParts)}`
            : `use ${compressCombo([...primaryParts, ...combo])}`;
      }
      const glyph = styleText(isSel ? "cyan" : "dim", "↩");
      const labelStyled = isSel
        ? styleText("cyan", dynamicLabel)
        : isCursor
          ? dynamicLabel
          : styleText("dim", dynamicLabel);
      // Toggled on → it overrides the checks; toggled off with a combo
      // staged → point at the enter key so the confirm path is obvious.
      const marker = isSel
        ? styleText("cyan", "  ← will skip combining")
        : combo.length > 0
          ? styleText("dim", "  ↵ enter to confirm")
          : "";
      lines.push(`${BAR}  ${arrow} ${glyph}  ${labelStyled}${marker}`);
      return;
    }

    // Conflict-blocked: another currently-selected option lists this
    // value in its conflicts (or vice-versa via the symmetric map).
    // Render disabled so the user can see why a toggle "doesn't take."
    let blocker: string | null = null;
    if (!isSel) {
      const partners = conflictMap.get(o.value);
      if (partners) {
        for (const sel of effective) {
          if (partners.has(sel)) { blocker = sel; break; }
        }
      }
    }

    if (blocker) {
      const box = styleText("dim", "[—]");
      const labelStyled = styleText("dim", icon(o.label));
      const conflictHint = styleText("dim", ` (conflicts with ${blocker})`);
      lines.push(`${BAR}  ${arrow} ${box} ${labelStyled}${conflictHint}`);
      return;
    }

    const box = isSel ? styleText("green", "[x]") : styleText("dim", "[ ]");
    const labelStyled = isSel || isCursor ? icon(o.label) : styleText("dim", icon(o.label));
    // Contribution at a glance: every row shows just the headline "+N skills"
    // (one token, never wraps); the focused row expands to the full
    // "+N skills · +M mcps · …" breakdown so detail is one keystroke away.
    const tally = state.preview ? state.preview.tallies.get(o.value) ?? EMPTY_TALLY : null;
    const delta = tally
      ? isCursor
        ? formatTallyDelta(tally)
        : tally.skills.length > 0
          ? `+${tally.skills.length} skills`
          : ""
      : "";
    const deltaStr = delta ? styleText("dim", `  ${delta}`) : "";
    // The verbose reason / description (detection signal, profile blurb)
    // stays cursor-only to keep the unfocused rows scannable.
    const hint = o.hint && isCursor ? styleText("dim", ` (${o.hint})`) : "";
    lines.push(`${BAR}  ${arrow} ${box} ${labelStyled}${deltaStr}${hint}`);
  };

  // The lead action row ("use X alone / + …") stays pinned on top; only the
  // companion list below it scrolls, so a long companion list can't push the
  // confirm row or preview off a short terminal. `maxRows` unset → no window.
  const rows = state.options.map((o, idx) => ({ o, idx }));
  const actionRows = rows.filter((r) => r.o.kind === "action");
  const companions = rows.filter((r) => r.o.kind !== "action");
  for (const r of actionRows) renderRow(r.o, r.idx);
  if (companions.length > 0) {
    lines.push(`${BAR}  ${styleText("dim", "─".repeat(28))}`);
    const max = state.maxRows && state.maxRows > 0 ? state.maxRows : companions.length;
    const cursorPos = companions.findIndex((r) => r.idx === state.cursor);
    const win = windowOptions(companions, cursorPos < 0 ? 0 : cursorPos, max);
    if (win.hiddenAbove > 0) lines.push(`${BAR}  ${styleText("dim", `↑ ${win.hiddenAbove} more`)}`);
    for (const r of win.items) renderRow(r.o, r.idx);
    if (win.hiddenBelow > 0) lines.push(`${BAR}  ${styleText("dim", `↓ ${win.hiddenBelow} more`)}`);
  }

  // Live combined-total preview: the resources you'd actually pin, updated
  // as you toggle. Skipping (action row on) collapses it to the primary.
  if (state.preview) {
    const { primary, tallies } = state.preview;
    const baseTally = tallies.get(primary) ?? EMPTY_TALLY;
    const selected = skipping
      ? [baseTally]
      : [
          baseTally,
          ...[...effective]
            .filter((v) => v !== SKIP_COMBINE)
            .map((v) => tallies.get(v) ?? EMPTY_TALLY),
        ];
    const previewLines = formatCombinedPreview(unionTallyCounts([baseTally]), unionTallyCounts(selected));
    for (const pl of previewLines) lines.push(`${BAR}  ${styleText("dim", `→ ${pl}`)}`);
    // Soft-warn when the combined always-on cost is heavy — at decision time,
    // not after materialize. Summing per-profile overhead slightly overcounts
    // shared skills, so it's an upper bound (the `~` says so).
    const combinedAlwaysOn = selected.reduce((sum, t) => sum + (t.alwaysOn ?? 0), 0);
    const badge = formatOverheadBadge(combinedAlwaysOn);
    if (badge) lines.push(`${BAR}  ${styleText("yellow", badge)}`);
  }

  const staged = skipping ? 0 : [...effective].filter((v) => v !== SKIP_COMBINE).length;
  const countLabel = staged > 0 ? `${staged} selected · ` : "";
  lines.push(
    `${BAR}  ${styleText("dim", `${countLabel}↑↓ move · space toggle · enter confirm · esc cancel`)}`,
  );
  return lines.join("\n");
}

async function asciiMultiselect(opts: {
  message: string;
  options: AsciiMSOption[];
  initialValues?: string[];
  required?: boolean;
  /**
   * When provided, render per-row "+N skills" hints and a live combined-total
   * preview line. `primary` is the always-present base profile; `tallies` maps
   * each profile value (primary + every companion) to its own resources.
   */
  preview?: { primary: string; tallies: Map<string, ProfileTally> };
}): Promise<string[] | symbol> {
  const conflictMap = buildConflictMap(opts.options);
  const prompt = new MultiSelectPrompt<AsciiMSOption>({
    options: opts.options,
    initialValues: opts.initialValues,
    required: opts.required ?? false,
    render() {
      // Reserve rows for our header (2), the pinned action row + divider (2),
      // the preview + overhead lines (3), the footer (1) and the ↑/↓ markers
      // (2); floor at 4 so a short terminal still shows a usable window.
      const termRows =
        (this as unknown as { output?: { rows?: number } }).output?.rows ?? process.stdout.rows ?? 24;
      return renderCombineFrame({
        message: opts.message,
        options: this.options,
        cursor: this.cursor,
        selected: (this.value ?? []) as string[],
        preview: opts.preview,
        maxRows: Math.max(4, termRows - 10),
      });
    },
  });
  const result = await prompt.prompt();
  if (typeof result === "symbol") return result;
  // Final pass: strip conflict-losers from the returned selection so callers
  // always receive a conflict-free list, regardless of what the underlying
  // prompt's internal value contained.
  return resolveConflicts(result as string[], conflictMap);
}

/**
 * Filter the option list by a typed query.
 *
 *   - empty query → every option, dividers kept as section headers, all
 *     non-divider rows are selectable.
 *   - non-empty query → dividers dropped (section headers are noise once the
 *     list is filtered) and only matching rows survive. A row matches if its
 *     `value` *starts with* the query (the requested behavior: press "s" →
 *     slack, studio, secops, stripe…). If nothing starts with the query we
 *     fall back to a substring match on value or label, so a mid-word search
 *     still finds something instead of a dead end.
 *
 * Pure + exported so the matching rules can be unit-tested without a TTY.
 */
export function filterOptions(
  options: PickerOption[],
  query: string,
): { display: PickerOption[]; selectable: PickerOption[] } {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return { display: options, selectable: options.filter((o) => o.divider !== true) };
  }
  const rows = options.filter((o) => o.divider !== true);
  const startsWith = rows.filter((o) => o.value.toLowerCase().startsWith(q));
  const pool =
    startsWith.length > 0
      ? startsWith
      : rows.filter(
          (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
        );
  return { display: pool, selectable: pool };
}

/**
 * Slice a list down to a scrolling window of at most `max` rows, centered on
 * `activeIndex`. Returns the visible slice plus how many rows are hidden above
 * and below (for "↑/↓ N more" indicators). When everything fits, the whole
 * list is returned with zero hidden. The active row stays centered until the
 * window hits either end, then it pins so the last/first rows stay reachable.
 *
 * Pure + exported so the scroll math is unit-testable without a TTY.
 */
export function windowOptions<T>(
  items: T[],
  activeIndex: number,
  max: number,
): { items: T[]; start: number; hiddenAbove: number; hiddenBelow: number } {
  if (max <= 0 || items.length <= max) {
    return { items, start: 0, hiddenAbove: 0, hiddenBelow: 0 };
  }
  let start = activeIndex - Math.floor(max / 2);
  start = Math.max(0, Math.min(start, items.length - max));
  const end = start + max;
  return {
    items: items.slice(start, end),
    start,
    hiddenAbove: start,
    hiddenBelow: items.length - end,
  };
}

// Interactive single-select with type-to-filter. clack's built-in `p.select`
// has no live filtering, so we drive @clack/core's base Prompt directly: with
// key-tracking on, printable keys buffer into `this.userInput` (readline owns
// backspace) and only the real arrow keys emit `cursor` events — j/k/h/l type
// into the filter instead of moving the cursor, which is what you want in a
// search box.
class FilterSelectPrompt extends Prompt<string> {
  message: string;
  allOptions: PickerOption[];
  display: PickerOption[] = [];
  selectable: PickerOption[] = [];
  cursor = 0;
  query = "";

  constructor(message: string, options: PickerOption[]) {
    // The render fn's `this` is the FilterSelectPrompt (bound by the base
    // Prompt), but the constructor types it against Prompt<string>; the cast
    // bridges that contravariance. Runtime binding is correct.
    super(
      {
        render(this: FilterSelectPrompt) {
          return this.renderFrame();
        },
      } as unknown as PromptOptions<string, Prompt<string>>,
      true,
    );
    this.message = message;
    this.allOptions = options;
    this.recompute();

    this.on("cursor", (dir) => {
      const n = this.selectable.length;
      if (n === 0) return;
      if (dir === "up") this.cursor = (this.cursor - 1 + n) % n;
      else if (dir === "down") this.cursor = (this.cursor + 1) % n;
      this.syncValue();
    });

    // `key` fires on every keypress (including arrows). We only re-filter when
    // the typed buffer actually changed, so arrow navigation doesn't reset it.
    this.on("key", () => {
      const next = (this.userInput ?? "").trim().toLowerCase();
      if (next === this.query) return;
      this.query = next;
      this.cursor = 0;
      this.recompute();
    });
  }

  private recompute(): void {
    const { display, selectable } = filterOptions(this.allOptions, this.query);
    this.display = display;
    this.selectable = selectable;
    if (this.cursor >= this.selectable.length) this.cursor = 0;
    this.syncValue();
  }

  private syncValue(): void {
    this.value = this.selectable[this.cursor]?.value;
  }

  // Rows available for option rows, derived from terminal height. Reserve space
  // for the intro line, our 2-line header, the footer, and the pin-confirm +
  // outro clack draws below — plus the two scroll indicators. Floor at 5 so a
  // short terminal still shows a usable window.
  private visibleRows(): number {
    const rows =
      (this.output as { rows?: number } | undefined)?.rows ?? process.stdout.rows ?? 24;
    return Math.max(5, rows - 10);
  }

  // Block submit on an empty result set so enter can't return undefined.
  protected override _shouldSubmit(): boolean {
    return this.selectable.length > 0;
  }

  // Bound to the instance by the base Prompt (`_render = render.bind(this)`),
  // so `this` here is the live prompt.
  renderFrame(this: FilterSelectPrompt): string {
    const BAR = styleText("gray", "│");
    const ascii = asciiIconsEnabled();
    const icon = (s: string) => stripIconIfAscii(s, ascii);

    if (this.state === "submit") {
      const chosen = this.allOptions.find((o) => o.value === this.value);
      return `${BAR}  ${styleText("green", "◇")}  ${this.message} ${styleText(
        "dim",
        icon(chosen?.label ?? String(this.value ?? "")),
      )}`;
    }
    if (this.state === "cancel") {
      return `${BAR}  ${styleText("red", "■")}  cancelled`;
    }

    const filterTag =
      this.query.length > 0
        ? styleText("dim", ` · filter: ${this.query}▏`)
        : styleText("dim", " · type to filter");

    const active = this.selectable[this.cursor];
    const lines: string[] = [];
    lines.push(`${BAR}`);
    lines.push(`${BAR}  ${styleText("cyan", "◆")}  ${this.message}${filterTag}`);

    if (this.display.length === 0) {
      lines.push(`${BAR}  ${styleText("yellow", `no profiles match "${this.query}"`)}`);
    }
    // Scroll the list so the active row stays centered and the top/bottom rows
    // remain reachable instead of being clipped off-screen on a long list.
    const activeIdx = active ? this.display.indexOf(active) : 0;
    const win = windowOptions(this.display, activeIdx, this.visibleRows());
    if (win.hiddenAbove > 0) {
      lines.push(`${BAR}  ${styleText("dim", `↑ ${win.hiddenAbove} more`)}`);
    }
    for (const o of win.items) {
      if (o.divider === true) {
        lines.push(`${BAR}  ${styleText("dim", icon(o.label))}`);
        continue;
      }
      const isCursor = o === active;
      const bullet = isCursor ? styleText("green", "●") : styleText("dim", "○");
      const label = isCursor ? icon(o.label) : styleText("dim", icon(o.label));
      const hint = isCursor && o.hint ? styleText("dim", `  ${o.hint}`) : "";
      lines.push(`${BAR}  ${bullet} ${label}${hint}`);
    }
    if (win.hiddenBelow > 0) {
      lines.push(`${BAR}  ${styleText("dim", `↓ ${win.hiddenBelow} more`)}`);
    }

    lines.push(
      `${BAR}  ${styleText("dim", "type to filter · ↑↓ move · enter select · esc cancel")}`,
    );
    return lines.join("\n");
  }
}

async function selectSkipDividers(
  opts: PickerOption[],
  message: string,
): Promise<string> {
  const prompt = new FilterSelectPrompt(message, opts);
  const result = await prompt.prompt();
  if (typeof result === "symbol") {
    p.cancel("cancelled");
    process.exit(130);
  }
  return result as string;
}

export async function runPicker(input: PickerInput): Promise<PickerOutput> {
  p.intro(`cue · pick a profile for ${input.cwd}`);

  let first = await selectSkipDividers(input.options, "Profile");

  // Conflict-aware switch nudge. If the user's first pick conflicts with any
  // profile that the cwd-detector also matched, surface a one-line prompt
  // offering to switch. Catches the most expensive picker mistake (wrong
  // framework profile for the directory). Skipped when:
  //   - detected list is empty (no autodetect signal)
  //   - the conflict partner wasn't actually detected (no real signal)
  //   - the user's pick was itself in the detected list (already aligned)
  const firstOptForNudge = input.options.find((o) => o.value === first);
  const detected = input.detected ?? [];
  const detectedNames = new Set(detected.map((d) => d.name));
  if (firstOptForNudge && !detectedNames.has(first)) {
    const conflictPartners = (firstOptForNudge.conflicts ?? []).filter((c) =>
      detectedNames.has(c),
    );
    if (conflictPartners.length > 0) {
      const partner = conflictPartners[0]!;
      const partnerInfo = detected.find((d) => d.name === partner)!;
      const reason = partnerInfo.reasons.slice(0, 2).join(", ");
      const switchChoice = await p.confirm({
        message:
          `Detected ${reason} — looks like a ${partner} project, not ${first}. ` +
          `Switch to ${partner}?`,
        initialValue: true,
      });
      if (p.isCancel(switchChoice)) {
        p.cancel("cancelled");
        process.exit(130);
      }
      if (switchChoice === true) first = partner;
    }
  }

  const picks: string[] = [first];

  // Suggested companions for the combine multiselect, drawn from three sources
  // (see buildCompanionOptions): the picked profile's `recommends:`, historical
  // pairings mined from the session log, and content-detected companions for
  // this cwd (image assets → higgsfield, markdown drafts → blog-writer, a
  // registered brand dir → postizz). Empty result = plain single-profile pin;
  // users who want non-recommended combos can `cue use a+b+c` directly.
  const firstOpt = input.options.find((o) => o.value === first);
  const { companionOptions, initialValues } = buildCompanionOptions({
    primary: first,
    primaryLabel: firstOpt?.label ?? first,
    options: input.options,
    recommends: firstOpt?.recommends ?? [],
    pairSuggested: input.pairSuggestions?.get(first) ?? [],
    companions: input.companions ?? [],
    universalSuggestions: input.universalSuggestions ?? [],
    autoCheckThreshold: COMBINE_AUTO_CHECK_CONFIDENCE,
  });
  if (companionOptions.length > 0) {
    // Precompute each offered profile's resources (primary + companions, small
    // N) so the live render stays synchronous: per-row "+N skills" hints and
    // the combined-total preview both read from this map. Absent resolver (or a
    // failing load) just means no preview — the multiselect works regardless.
    let preview: { primary: string; tallies: Map<string, ProfileTally> } | undefined;
    if (input.resourceTally) {
      const wanted = [first, ...companionOptions.filter((o) => o.kind !== "action").map((o) => o.value)];
      const tallies = new Map<string, ProfileTally>();
      await Promise.all(
        wanted.map(async (v) => {
          try {
            tallies.set(v, await input.resourceTally!(v));
          } catch {
            /* skip this profile — it just renders without counts */
          }
        }),
      );
      if (tallies.has(first)) preview = { primary: first, tallies };
    }
    const extra = await asciiMultiselect({
      message: `Combine ${first} with…`,
      options: companionOptions,
      initialValues: initialValues.length > 0 ? initialValues : undefined,
      required: false,
      preview,
    });
    if (p.isCancel(extra)) {
      p.cancel("cancelled");
      process.exit(130);
    }
    const selected = extra as string[];
    // The SKIP_COMBINE sentinel (the "use <primary> alone" row) means "primary
    // only" even when other rows are checked; enter-with-nothing-checked is the
    // same, the explicit row is just a visible escape hatch.
    if (!selected.includes(SKIP_COMBINE)) {
      for (const v of selected) {
        if (!picks.includes(v)) picks.push(v);
      }
    }
  }

  // `first` may itself be a composite ("a+b+c"); flatten + dedupe so a profile
  // already in the composite primary — or one picked twice — can't bloat the
  // selector, the runtime dir name, or the summary breakdown.
  const choiceParts = dedupeSelectorParts(picks);
  const choice = choiceParts.join("+");

  // Build a display label with icon(s) for the outro line, per deduped part.
  const pickedLabel = choiceParts
    .map((pk) => input.options.find((o) => o.value === pk)?.label ?? pk)
    .join(" + ");

  let pinned = false;
  if (!input.noPin) {
    const pinChoice = await p.confirm({ message: "Pin to this directory?", initialValue: true });
    if (p.isCancel(pinChoice)) {
      p.cancel("cancelled");
      process.exit(130);
    }
    if (pinChoice === true) {
      await writeFile(join(input.cwd, ".cue-profile"), `${choice}\n`);
      pinned = true;
    }
  }

  if (input.details) {
    try {
      const lines = await input.details(choice);
      for (const line of lines) {
        if (line.length > 0) p.log.message(line);
      }
    } catch (err) {
      p.log.warn(`details unavailable: ${(err as Error).message}`);
    }
  }

  p.outro(`profile: ${pickedLabel}${pinned ? " (pinned)" : ""}`);
  return { profile: choice, pinned };
}
