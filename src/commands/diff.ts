/**
 * `cue diff <profileA> <profileB>` — compare two profiles.
 */

import { loadProfile } from "../lib/profile-loader";

export async function run(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const names = args.filter(a => !a.startsWith("-"));

  if (names.length < 2) {
    process.stderr.write("Usage: cue diff <profileA> <profileB>\n");
    return 1;
  }

  const [nameA, nameB] = names;
  let profileA, profileB;
  try { profileA = await loadProfile(nameA!); } catch (e) { process.stderr.write(`${e}\n`); return 1; }
  try { profileB = await loadProfile(nameB!); } catch (e) { process.stderr.write(`${e}\n`); return 1; }

  const skillsA = new Set(profileA.skills.local.map(s => s.id));
  const skillsB = new Set(profileB.skills.local.map(s => s.id));
  const mcpsA = new Set(profileA.mcps.map(m => m.id));
  const mcpsB = new Set(profileB.mcps.map(m => m.id));
  const pluginsA = new Set(profileA.plugins.map(p => p.id));
  const pluginsB = new Set(profileB.plugins.map(p => p.id));

  const diff = {
    skills: {
      onlyA: [...skillsA].filter(s => !skillsB.has(s)),
      onlyB: [...skillsB].filter(s => !skillsA.has(s)),
      both: [...skillsA].filter(s => skillsB.has(s)),
    },
    mcps: {
      onlyA: [...mcpsA].filter(m => !mcpsB.has(m)),
      onlyB: [...mcpsB].filter(m => !mcpsA.has(m)),
      both: [...mcpsA].filter(m => mcpsB.has(m)),
    },
    plugins: {
      onlyA: [...pluginsA].filter(p => !pluginsB.has(p)),
      onlyB: [...pluginsB].filter(p => !pluginsA.has(p)),
      both: [...pluginsA].filter(p => pluginsB.has(p)),
    },
    env: {
      onlyA: Object.keys(profileA.env).filter(k => !(k in profileB.env)),
      onlyB: Object.keys(profileB.env).filter(k => !(k in profileA.env)),
      different: Object.keys(profileA.env).filter(k => k in profileB.env && profileA.env[k] !== profileB.env[k]),
    },
  };

  if (json) {
    process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`Comparing: ${nameA} ↔ ${nameB}\n\n`);

  // Skills
  process.stdout.write("Skills:\n");
  for (const s of diff.skills.onlyA) process.stdout.write(`  - ${s}  (only in ${nameA})\n`);
  for (const s of diff.skills.onlyB) process.stdout.write(`  + ${s}  (only in ${nameB})\n`);
  if (diff.skills.both.length) process.stdout.write(`  = ${diff.skills.both.length} shared\n`);
  if (!diff.skills.onlyA.length && !diff.skills.onlyB.length) process.stdout.write("  (identical)\n");

  // MCPs
  process.stdout.write("\nMCPs:\n");
  for (const m of diff.mcps.onlyA) process.stdout.write(`  - ${m}  (only in ${nameA})\n`);
  for (const m of diff.mcps.onlyB) process.stdout.write(`  + ${m}  (only in ${nameB})\n`);
  if (diff.mcps.both.length) process.stdout.write(`  = ${diff.mcps.both.length} shared\n`);
  if (!diff.mcps.onlyA.length && !diff.mcps.onlyB.length) process.stdout.write("  (identical)\n");

  // Plugins
  process.stdout.write("\nPlugins:\n");
  for (const p of diff.plugins.onlyA) process.stdout.write(`  - ${p}  (only in ${nameA})\n`);
  for (const p of diff.plugins.onlyB) process.stdout.write(`  + ${p}  (only in ${nameB})\n`);
  if (!diff.plugins.onlyA.length && !diff.plugins.onlyB.length) process.stdout.write("  (identical)\n");

  // Env
  if (diff.env.onlyA.length || diff.env.onlyB.length || diff.env.different.length) {
    process.stdout.write("\nEnv:\n");
    for (const k of diff.env.onlyA) process.stdout.write(`  - ${k}=${profileA.env[k]}  (only in ${nameA})\n`);
    for (const k of diff.env.onlyB) process.stdout.write(`  + ${k}=${profileB.env[k]}  (only in ${nameB})\n`);
    for (const k of diff.env.different) process.stdout.write(`  ~ ${k}: "${profileA.env[k]}" → "${profileB.env[k]}"\n`);
  }

  return 0;
}
