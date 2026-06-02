/**
 * Opt-in debug logging for cue's many best-effort code paths.
 *
 * cue deliberately swallows a lot of non-fatal errors (missing files, malformed
 * JSON, absent optional tools) so one bad input never blocks a launch. That's
 * correct, but it makes failures invisible when something genuinely IS wrong —
 * the user sees a silent degradation with no signal. `debug()` surfaces those
 * swallowed errors on stderr ONLY when `CUE_DEBUG` is set, so normal runs stay
 * quiet and `CUE_DEBUG=1 cue …` turns into a diagnosis tool.
 *
 *   try { risky(); } catch (err) { debug("launch:autodetect", err); }
 */

/** True when CUE_DEBUG is set to a non-falsy value (`0`/`false`/empty = off). */
export function debugEnabled(): boolean {
  const v = process.env.CUE_DEBUG;
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

/** Render an arbitrary catch value to a single log string. */
function format(detail: unknown): string {
  if (detail === undefined) return "";
  if (detail instanceof Error) return detail.stack ?? `${detail.name}: ${detail.message}`;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/**
 * Emit a namespaced debug line to stderr when CUE_DEBUG is enabled; a no-op
 * otherwise. `scope` is a short "area:step" tag (e.g. "launch:autodetect");
 * `detail` is the swallowed error or a message. Never throws.
 */
export function debug(scope: string, detail?: unknown): void {
  if (!debugEnabled()) return;
  const rendered = format(detail);
  try {
    process.stderr.write(`[cue:debug] ${scope}${rendered ? ` — ${rendered}` : ""}\n`);
  } catch {
    /* stderr unavailable — debug logging must never itself break a run */
  }
}
