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
}

export interface PickerOutput {
  profile: string;
  pinned: boolean;
}

// clack's built-in multiselect uses U+25FB/U+25FC squares for the toggle box,
// which render as blanks in some fonts under kitty/tmux — the user can't see
// what's on or off. This wraps @clack/core's MultiSelectPrompt with an ASCII
// render so the state is visible everywhere.
type AsciiMSOption = {
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

async function asciiMultiselect(opts: {
  message: string;
  options: AsciiMSOption[];
  initialValues?: string[];
  required?: boolean;
}): Promise<string[] | symbol> {
  const BAR = styleText("gray", "│");
  const conflictMap = buildConflictMap(opts.options);
  const prompt = new MultiSelectPrompt<AsciiMSOption>({
    options: opts.options,
    initialValues: opts.initialValues,
    required: opts.required ?? false,
    render() {
      // Apply conflict resolution to the live value so the display matches
      // what we'd actually return on confirm. The underlying MultiSelectPrompt
      // may have a conflicting value internally (we can't easily block its
      // toggle), but the user never sees it as selected — and confirm strips
      // it for real.
      const rawValue = (this.value ?? []) as string[];
      const effective = new Set(resolveConflicts(rawValue, conflictMap));
      const lines: string[] = [];
      lines.push(`${BAR}`);
      lines.push(`${BAR}  ${opts.message}`);
      this.options.forEach((o, idx) => {
        const isCursor = idx === this.cursor;
        const isSel = effective.has(o.value);
        const arrow = isCursor ? styleText("cyan", "›") : " ";

        if (o.kind === "action") {
          const prev = this.options[idx - 1];
          if (prev && prev.kind !== "action") {
            lines.push(`${BAR}  ${styleText("dim", "─".repeat(28))}`);
          }
          const glyph = styleText(isSel ? "cyan" : "dim", "↩");
          const labelStyled = isSel
            ? styleText("cyan", o.label)
            : isCursor
              ? o.label
              : styleText("dim", o.label);
          const marker = isSel ? styleText("cyan", "  ← will skip combining") : "";
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
          const labelStyled = styleText("dim", o.label);
          const conflictHint = styleText("dim", ` (conflicts with ${blocker})`);
          lines.push(`${BAR}  ${arrow} ${box} ${labelStyled}${conflictHint}`);
          return;
        }

        const box = isSel ? styleText("green", "[x]") : styleText("dim", "[ ]");
        const labelStyled = isSel || isCursor ? o.label : styleText("dim", o.label);
        const hint = o.hint && isCursor ? styleText("dim", ` (${o.hint})`) : "";
        lines.push(`${BAR}  ${arrow} ${box} ${labelStyled}${hint}`);
      });
      lines.push(
        `${BAR}  ${styleText("dim", "↑↓ move · space toggle · enter confirm · esc cancel")}`,
      );
      return lines.join("\n");
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

    if (this.state === "submit") {
      const chosen = this.allOptions.find((o) => o.value === this.value);
      return `${BAR}  ${styleText("green", "◇")}  ${this.message} ${styleText(
        "dim",
        chosen?.label ?? String(this.value ?? ""),
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
        lines.push(`${BAR}  ${styleText("dim", o.label)}`);
        continue;
      }
      const isCursor = o === active;
      const bullet = isCursor ? styleText("green", "●") : styleText("dim", "○");
      const label = isCursor ? o.label : styleText("dim", o.label);
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

  // Suggested companions: the picked profile's `recommends:` list, filtered to
  // entries that actually exist as options. Skips composite values (anything
  // containing `+`) — they can't be stacked further. Empty selection = plain
  // single-profile pin. The picker no longer offers arbitrary combine; users
  // who want non-recommended combos can `cue use a+b+c` directly.
  const firstOpt = input.options.find((o) => o.value === first);
  const recommendsRaw = firstOpt?.recommends ?? [];
  // Historical pair suggestions from local session log — merged into the
  // recommends list so the multiselect surfaces empirical partners even
  // when the profile author didn't think to add them to recommends.
  const pairSuggested = input.pairSuggestions?.get(first) ?? [];
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const r of [...recommendsRaw, ...pairSuggested]) {
    if (seen.has(r)) continue;
    seen.add(r);
    merged.push(r);
  }
  const recommends = merged.filter((r) => {
    if (r === first) return false;
    const target = input.options.find((o) => o.value === r);
    return target !== undefined && target.divider !== true;
  });
  const pairSuggestedSet = new Set(pairSuggested);
  if (recommends.length > 0) {
    // Sentinel for the first option ("skip combining"). Picking it — even
    // alongside others — means "use the primary profile alone." Pressing
    // enter with nothing checked has the same effect; the explicit row is
    // there so users who don't realize that have a visible escape hatch.
    const SKIP = "__skip_combine__";
    const firstLabel = firstOpt?.label ?? first;
    const companionOptions: AsciiMSOption[] = [
      ...recommends
        .map((r) => input.options.find((o) => o.value === r)!)
        .map((o) => ({
          value: o.value,
          label: o.label,
          hint: o.hint,
          // Forward each option's conflict declarations so the multiselect
          // can disable mutually-exclusive partners (e.g. medusa-vite blocks
          // medusa-next once checked).
          conflicts: o.conflicts,
        })),
      { value: SKIP, label: `use ${firstLabel} alone`, hint: "", kind: "action" },
    ];
    // Pre-check any recommended companion whose source option has the
    // `preselect` flag set (cwd autodetection sets this) OR which appears
    // in the pair-suggestion map for the primary (historical signal). Both
    // sources merge into a single de-duped initialValues list. Conflict
    // resolution still applies at confirm time so a bad pair of preselects
    // can't sneak through.
    const initialValues = recommends
      .filter((r) => {
        if (pairSuggestedSet.has(r)) return true;
        return input.options.find((o) => o.value === r)?.preselect === true;
      })
      .filter((r, i, arr) => arr.indexOf(r) === i);
    const extra = await asciiMultiselect({
      message: `Combine ${first} with…`,
      options: companionOptions,
      initialValues: initialValues.length > 0 ? initialValues : undefined,
      required: false,
    });
    if (p.isCancel(extra)) {
      p.cancel("cancelled");
      process.exit(130);
    }
    const selected = extra as string[];
    if (!selected.includes(SKIP)) {
      for (const v of selected) {
        if (!picks.includes(v)) picks.push(v);
      }
    }
  }

  const choice = picks.join("+");

  // Build a display label with icon(s) for the outro line
  const pickedLabel = picks
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
