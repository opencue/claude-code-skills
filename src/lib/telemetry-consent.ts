/**
 * Telemetry consent module.
 *
 * Single source of truth for whether cue is allowed to write to
 * `~/.config/cue/analytics.jsonl`. Existence of `~/.config/cue/.telemetry-consent`
 * means opted-in; absence means opted-out (the default after upgrade).
 *
 * Storage is a single small JSON file with a version + enabled_at timestamp
 * so we can evolve the consent record without breaking existing installs.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { configDir } from "./config-paths";

const CONSENT_RECORD_VERSION = 1;

// Re-exported for back-compat: external callers import `configDir` from here.
export { configDir };

export function consentPath(): string {
  return join(configDir(), ".telemetry-consent");
}

export function analyticsPath(): string {
  return join(configDir(), "analytics.jsonl");
}

export function seenTrackerPath(): string {
  return join(configDir(), ".telemetry-seen.json");
}

export function isEnabled(): boolean {
  return existsSync(consentPath());
}

export interface EnableResult {
  /** Bytes wiped from a pre-existing `analytics.jsonl`, if any. */
  wipedLegacyBytes: number;
  alreadyEnabled: boolean;
}

/**
 * Opt in. Creates the consent record. If a pre-existing `analytics.jsonl`
 * was being written silently by older cue versions, wipes it so the user
 * starts fresh under explicit consent (per locked v1 scope).
 */
export function enable(): EnableResult {
  const alreadyEnabled = isEnabled();
  mkdirSync(configDir(), { recursive: true });

  let wipedBytes = 0;
  if (!alreadyEnabled && existsSync(analyticsPath())) {
    try { wipedBytes = statSync(analyticsPath()).size; } catch { /* best-effort */ }
    try { unlinkSync(analyticsPath()); } catch { /* best-effort */ }
  }

  writeFileSync(
    consentPath(),
    JSON.stringify({
      version: CONSENT_RECORD_VERSION,
      enabled_at: new Date().toISOString(),
    }) + "\n",
  );
  return { wipedLegacyBytes: wipedBytes, alreadyEnabled };
}

/**
 * Opt out. Removes the consent record. Does NOT wipe historical events,
 * so the user can re-enable and keep their data if they change their mind.
 * Use `purge()` to delete events.
 */
export function disable(): { wasEnabled: boolean } {
  const wasEnabled = isEnabled();
  if (wasEnabled) {
    try { unlinkSync(consentPath()); } catch { /* best-effort */ }
  }
  return { wasEnabled };
}

export interface PurgeResult {
  removedAnalyticsBytes: number;
  removedSeenTrackerBytes: number;
}

/**
 * Wipe events + the ingest-dedup tracker. Leaves the consent flag intact
 * (the user can keep recording from now on). To stop recording entirely,
 * call `disable()` afterward.
 */
export function purge(): PurgeResult {
  let analyticsBytes = 0;
  if (existsSync(analyticsPath())) {
    try { analyticsBytes = statSync(analyticsPath()).size; } catch { /* best-effort */ }
    try { unlinkSync(analyticsPath()); } catch { /* best-effort */ }
  }
  let seenBytes = 0;
  if (existsSync(seenTrackerPath())) {
    try { seenBytes = statSync(seenTrackerPath()).size; } catch { /* best-effort */ }
    try { unlinkSync(seenTrackerPath()); } catch { /* best-effort */ }
  }
  return { removedAnalyticsBytes: analyticsBytes, removedSeenTrackerBytes: seenBytes };
}

export interface TelemetryStatus {
  enabled: boolean;
  enabledAt: string | null;
  eventCount: number;
  oldestEventTs: string | null;
  newestEventTs: string | null;
  fileSizeBytes: number;
  filePath: string;
  /** True when telemetry is disabled but a legacy `analytics.jsonl` still exists. */
  hasLegacyData: boolean;
  legacyDataBytes: number;
}

export function statusSummary(): TelemetryStatus {
  const enabled = isEnabled();
  let enabledAt: string | null = null;
  if (enabled) {
    try {
      const text = readFileSync(consentPath(), "utf8").split("\n")[0] ?? "{}";
      const parsed = JSON.parse(text) as { enabled_at?: string };
      enabledAt = parsed.enabled_at ?? null;
    } catch { /* keep null */ }
  }

  let eventCount = 0;
  let oldestEventTs: string | null = null;
  let newestEventTs: string | null = null;
  let fileSize = 0;
  const analyticsExists = existsSync(analyticsPath());
  if (analyticsExists) {
    try { fileSize = statSync(analyticsPath()).size; } catch { /* keep 0 */ }
    try {
      const lines = readFileSync(analyticsPath(), "utf8").split("\n").filter((l) => l.trim().length > 0);
      eventCount = lines.length;
      // Events aren't appended in time order (transcripts get backfilled in
      // mtime-sorted scan order). Compute min/max over all timestamps.
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as { ts?: string };
          if (!parsed.ts) continue;
          if (oldestEventTs === null || parsed.ts < oldestEventTs) oldestEventTs = parsed.ts;
          if (newestEventTs === null || parsed.ts > newestEventTs) newestEventTs = parsed.ts;
        } catch { /* skip malformed */ }
      }
    } catch { /* keep 0/null */ }
  }

  return {
    enabled,
    enabledAt,
    eventCount,
    oldestEventTs,
    newestEventTs,
    fileSizeBytes: fileSize,
    filePath: analyticsPath(),
    hasLegacyData: !enabled && analyticsExists && fileSize > 0,
    legacyDataBytes: !enabled ? fileSize : 0,
  };
}
