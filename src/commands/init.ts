/**
 * `cue init` — project scanner + profile wizard.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";

import { detectProfile } from "../lib/auto-detect";
import { scanProject } from "../lib/project-scanner";
import { listProfiles } from "../lib/profile-loader";

export async function run(args: string[]): Promise<number> {
  const cwd = process.cwd();

  p.intro("🎯 cue init — set up profile for this project");

  // Scan
  const project = scanProject(cwd);
  const detected: string[] = [...project.languages, ...project.frameworks, ...project.tools];

  if (detected.length) {
    p.log.info(`Detected: ${detected.join(", ")}`);
  } else {
    p.log.info("No strong project signals detected.");
  }

  // Score
  const suggestions = detectProfile(cwd);
  const allProfiles = await listProfiles();

  // Present options
  const options: { value: string; label: string; hint?: string }[] = [];

  for (let i = 0; i < Math.min(suggestions.length, 3); i++) {
    const s = suggestions[i]!;
    options.push({
      value: s.profile,
      label: s.profile,
      hint: `${s.confidence}% match — ${s.signals.join(", ")}`,
    });
  }

  // Add remaining profiles not in suggestions
  const suggestedNames = new Set(suggestions.map(s => s.profile));
  for (const name of allProfiles) {
    if (suggestedNames.has(name)) continue;
    if (name.startsWith("_")) continue;
    options.push({ value: name, label: name });
  }

  options.push({ value: "__new", label: "Create a new profile", hint: "interactive wizard" });
  options.push({ value: "__skip", label: "Skip — don't pin a profile" });

  const choice = await p.select({
    message: "Which profile for this directory?",
    options,
  });

  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    return 130;
  }

  if (choice === "__skip") {
    p.outro("No profile pinned. Run `cue init` again anytime.");
    return 0;
  }

  if (choice === "__new") {
    const name = await p.text({
      message: "Profile name",
      placeholder: "my-project",
      validate: v => !/^[a-z][a-z0-9-]{1,63}$/.test(v) ? "Must be kebab-case" : undefined,
    });
    if (p.isCancel(name)) { p.cancel("Cancelled."); return 130; }

    const desc = await p.text({
      message: "Description",
      placeholder: `Profile for ${cwd.split("/").pop()}`,
    });
    if (p.isCancel(desc)) { p.cancel("Cancelled."); return 130; }

    // Create minimal profile
    const { run: createProfile } = await import("./create-profile");
    await createProfile([name as string, "--description", desc as string, "--icon", "🔧"]);

    writeFileSync(join(cwd, ".cue-profile"), (name as string) + "\n");
    p.outro(`✅ Created profile "${name}" and pinned to this directory.`);
    return 0;
  }

  // Pin the chosen profile
  writeFileSync(join(cwd, ".cue-profile"), (choice as string) + "\n");
  p.outro(`✅ Pinned "${choice}" to this directory. Next \`claude\` launch will use it.`);
  return 0;
}
