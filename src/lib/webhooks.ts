/**
 * Webhooks — fire notifications on profile events.
 * Config: ~/.config/cue/config.yaml
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "cue",
  "config.yaml",
);

interface WebhookConfig {
  url: string;
  events: string[];
}

interface CueConfig {
  webhooks?: WebhookConfig[];
}

function loadConfig(): CueConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const yaml = require("yaml");
    return yaml.parse(readFileSync(CONFIG_PATH, "utf8")) ?? {};
  } catch {
    return {};
  }
}

export type WebhookEvent = "profile.modified" | "profile.created" | "profile.locked" | "profile.unlocked";

export async function fireWebhook(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const config = loadConfig();
  if (!config.webhooks?.length) return;

  const matching = config.webhooks.filter(w => w.events.includes(event));
  if (!matching.length) return;

  const body = JSON.stringify({ event, ts: new Date().toISOString(), ...payload });

  for (const hook of matching) {
    try {
      await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Webhooks are best-effort — don't block the CLI
    }
  }
}
