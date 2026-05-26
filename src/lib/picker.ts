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
import { MultiSelectPrompt } from "@clack/core";
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
  /** "action" rows (e.g. the skip-combine escape hatch) render distinct: no
   *  checkbox, a dim divider above, dim glyph when unselected. */
  kind?: "action";
};
async function asciiMultiselect(opts: {
  message: string;
  options: AsciiMSOption[];
  initialValues?: string[];
  required?: boolean;
}): Promise<string[] | symbol> {
  const BAR = styleText("gray", "│");
  const prompt = new MultiSelectPrompt<AsciiMSOption>({
    options: opts.options,
    initialValues: opts.initialValues,
    required: opts.required ?? false,
    render() {
      const selected = new Set(this.value ?? []);
      const lines: string[] = [];
      lines.push(`${BAR}`);
      lines.push(`${BAR}  ${opts.message}`);
      this.options.forEach((o, idx) => {
        const isCursor = idx === this.cursor;
        const isSel = selected.has(o.value);
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
  return (await prompt.prompt()) as string[] | symbol;
}

async function selectSkipDividers(
  opts: PickerOption[],
  message: string,
): Promise<string> {
  // `disabled: true` makes clack render the option (gray) but skip it during
  // arrow/j-k navigation, so the user can't land on a divider.
  const result = await p.select({
    message,
    options: opts.map((o) => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
      disabled: o.divider === true,
    })),
  });
  if (p.isCancel(result)) {
    p.cancel("cancelled");
    process.exit(130);
  }
  return result as string;
}

export async function runPicker(input: PickerInput): Promise<PickerOutput> {
  p.intro(`cue · pick a profile for ${input.cwd}`);

  const first = await selectSkipDividers(input.options, "Profile");
  const picks: string[] = [first];

  // Suggested companions: the picked profile's `recommends:` list, filtered to
  // entries that actually exist as options. Skips composite values (anything
  // containing `+`) — they can't be stacked further. Empty selection = plain
  // single-profile pin. The picker no longer offers arbitrary combine; users
  // who want non-recommended combos can `cue use a+b+c` directly.
  const firstOpt = input.options.find((o) => o.value === first);
  const recommends = (firstOpt?.recommends ?? []).filter((r) => {
    if (r === first) return false;
    const target = input.options.find((o) => o.value === r);
    return target !== undefined && target.divider !== true;
  });
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
        .map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
      { value: SKIP, label: `use ${firstLabel} alone`, hint: "", kind: "action" },
    ];
    const extra = await asciiMultiselect({
      message: `Combine ${first} with…`,
      options: companionOptions,
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
