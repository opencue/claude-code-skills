/**
 * `cue lock <profile>` / `cue unlock <profile>` — profile locking.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROFILES_DIR = process.env.CUE_PROFILES_DIR ?? join(REPO_ROOT, "profiles");

export function isProfileLocked(profileName: string): { locked: boolean; by?: string; reason?: string } {
  const yamlPath = join(PROFILES_DIR, profileName, "profile.yaml");
  try {
    const content = readFileSync(yamlPath, "utf8");
    const lockedMatch = content.match(/^locked:\s*(true|yes)/m);
    if (!lockedMatch) return { locked: false };
    const byMatch = content.match(/^locked_by:\s*["']?(.+?)["']?\s*$/m);
    const reasonMatch = content.match(/^locked_reason:\s*["']?(.+?)["']?\s*$/m);
    return { locked: true, by: byMatch?.[1], reason: reasonMatch?.[1] };
  } catch {
    return { locked: false };
  }
}

export async function run(args: string[]): Promise<number> {
  const sub = args[0]; // "lock" or "unlock" (routed from _index.ts)
  // When called as `cue lock <profile>`, args = ["<profile>", ...]
  // The command name is already stripped by the router
  const profileName = args.find(a => !a.startsWith("-"));

  if (!profileName) {
    process.stderr.write("Usage: cue lock <profile> [--by <name>] [--reason <text>]\n");
    process.stderr.write("       cue unlock <profile>\n");
    return 1;
  }

  const yamlPath = join(PROFILES_DIR, profileName, "profile.yaml");
  let content: string;
  try {
    content = readFileSync(yamlPath, "utf8");
  } catch {
    process.stderr.write(`Profile "${profileName}" not found\n`);
    return 1;
  }

  // Determine if this is lock or unlock based on the command name
  // The _index.ts routes "lock" and "unlock" both here
  const isUnlock = process.argv.includes("unlock");

  if (isUnlock) {
    // Remove lock fields
    content = content.replace(/^locked:.*\n/m, "");
    content = content.replace(/^locked_by:.*\n/m, "");
    content = content.replace(/^locked_reason:.*\n/m, "");
    writeFileSync(yamlPath, content);
    process.stdout.write(`🔓 Unlocked profile "${profileName}"\n`);
    return 0;
  }

  // Lock
  const byIdx = args.indexOf("--by");
  const by = byIdx >= 0 ? args[byIdx + 1] : undefined;
  const reasonIdx = args.indexOf("--reason");
  const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : undefined;

  // Remove existing lock fields first
  content = content.replace(/^locked:.*\n/m, "");
  content = content.replace(/^locked_by:.*\n/m, "");
  content = content.replace(/^locked_reason:.*\n/m, "");

  // Add lock fields after description
  const lockLines = [`locked: true`];
  if (by) lockLines.push(`locked_by: "${by}"`);
  if (reason) lockLines.push(`locked_reason: "${reason}"`);

  const insertAfter = content.match(/^description:.*$/m);
  if (insertAfter) {
    const idx = content.indexOf(insertAfter[0]) + insertAfter[0].length;
    content = content.slice(0, idx) + "\n" + lockLines.join("\n") + content.slice(idx);
  } else {
    content = content.trimEnd() + "\n" + lockLines.join("\n") + "\n";
  }

  writeFileSync(yamlPath, content);
  process.stdout.write(`🔒 Locked profile "${profileName}"${by ? ` (by ${by})` : ""}\n`);
  return 0;
}
