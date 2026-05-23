/**
 * `cue colony-dispatch --task "..."` — resolve profile for a Colony task.
 */

import { resolveProfileForTask } from "../lib/colony-dispatch";

export async function run(args: string[]): Promise<number> {
  const taskIdx = args.indexOf("--task");
  const task = taskIdx >= 0 ? args.slice(taskIdx + 1).join(" ") : args.join(" ");
  const json = args.includes("--json");

  if (!task) {
    process.stderr.write("Usage: cue colony-dispatch --task \"review PR #42\"\n");
    return 1;
  }

  const result = resolveProfileForTask(task);

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(result.profile + "\n");
  }
  return 0;
}
