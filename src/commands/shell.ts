/**
 * `cue shell hook` — output shell code for auto-profile switching on cd.
 * `cue shell install` — install shims
 *
 * Usage: eval "$(cue shell hook)"
 * Adds a cd wrapper that checks .cue-profile on directory change.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

function hookBash(): string {
  return `# cue shell hook — auto-switch profile on cd
__cue_cd() {
  builtin cd "$@" || return
  __cue_check_profile
}

__cue_check_profile() {
  local dir="$PWD"
  local profile=""
  while [ "$dir" != "/" ] && [ "$dir" != "$HOME" ]; do
    if [ -f "$dir/.cue-profile" ]; then
      profile="$(cat "$dir/.cue-profile" 2>/dev/null | tr -d '\\n')"
      break
    fi
    dir="$(dirname "$dir")"
  done
  if [ -n "$profile" ] && [ "$profile" != "$__CUE_ACTIVE_PROFILE" ]; then
    export __CUE_ACTIVE_PROFILE="$profile"
    echo -e "\\033[38;5;208mcue:\\033[0m switched to profile \\033[1m$profile\\033[0m"
  fi
}

alias cd='__cue_cd'
# Check on shell start too
__cue_check_profile
`;
}

function hookZsh(): string {
  return `# cue shell hook — auto-switch profile on cd
__cue_check_profile() {
  local dir="$PWD"
  local profile=""
  while [[ "$dir" != "/" && "$dir" != "$HOME" ]]; do
    if [[ -f "$dir/.cue-profile" ]]; then
      profile="$(cat "$dir/.cue-profile" | tr -d '\\n')"
      break
    fi
    dir="$(dirname "$dir")"
  done
  if [[ -n "$profile" && "$profile" != "$__CUE_ACTIVE_PROFILE" ]]; then
    export __CUE_ACTIVE_PROFILE="$profile"
    echo -e "\\033[38;5;208mcue:\\033[0m switched to profile \\033[1m$profile\\033[0m"
  fi
}

autoload -U add-zsh-hook
add-zsh-hook chpwd __cue_check_profile
# Check on shell start too
__cue_check_profile
`;
}

function hookFish(): string {
  return `# cue shell hook — auto-switch profile on cd
function __cue_check_profile --on-variable PWD
  set -l dir $PWD
  set -l profile ""
  while test "$dir" != "/" -a "$dir" != "$HOME"
    if test -f "$dir/.cue-profile"
      set profile (cat "$dir/.cue-profile" | string trim)
      break
    end
    set dir (dirname "$dir")
  end
  if test -n "$profile" -a "$profile" != "$__CUE_ACTIVE_PROFILE"
    set -gx __CUE_ACTIVE_PROFILE $profile
    echo -e "\\033[38;5;208mcue:\\033[0m switched to profile \\033[1m$profile\\033[0m"
  end
end
__cue_check_profile
`;
}

export interface ShimOptions {
  homeDir?: string;
  pathDirs?: string[];
  realClaude?: string;
  realCodex?: string;
}

export async function runInstall(opts: ShimOptions = {}): Promise<number> {
  const home = opts.homeDir ?? homedir();
  const shimDir = join(home, ".local", "bin");
  const pathDirs = opts.pathDirs ?? (process.env.PATH ?? "").split(":");
  const { mkdirSync, writeFileSync, chmodSync } = await import("node:fs");

  // Check PATH ordering — shimDir must come before the real binary
  const shimIdx = pathDirs.indexOf(shimDir);
  const realClaude = opts.realClaude ?? "/usr/bin/claude";
  const realDir = realClaude ? resolve(realClaude, "..") : null;
  if (realDir) {
    const realIdx = pathDirs.indexOf(realDir);
    if (shimIdx >= 0 && realIdx >= 0 && shimIdx > realIdx) {
      process.stderr.write(`❌ ${shimDir} must appear before ${realDir} on PATH\n`);
      return 1;
    }
  }

  mkdirSync(shimDir, { recursive: true });
  const cueBin = resolve(process.env.CUE_REPO_ROOT ?? join(home, "Documents", "cue"), "bin", "cue");

  const claudeShim = `#!/usr/bin/env bash\nexec cue launch claude "$@"\n`;
  writeFileSync(join(shimDir, "claude"), claudeShim);
  chmodSync(join(shimDir, "claude"), 0o755);

  if (opts.realCodex) {
    const codexShim = `#!/usr/bin/env bash\nexec cue launch codex "$@"\n`;
    writeFileSync(join(shimDir, "codex"), codexShim);
    chmodSync(join(shimDir, "codex"), 0o755);
  }

  return 0;
}

export async function runUninstall(opts: { homeDir?: string } = {}): Promise<number> {
  const home = opts.homeDir ?? homedir();
  const shimDir = join(home, ".local", "bin");
  const { unlinkSync } = await import("node:fs");

  for (const name of ["claude", "codex"]) {
    const p = join(shimDir, name);
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
  return 0;
}

export async function run(args: string[]): Promise<number> {
  const sub = args[0];

  if (sub === "hook") {
    const shell = process.env.SHELL ?? "/bin/bash";
    if (shell.includes("zsh")) {
      process.stdout.write(hookZsh());
    } else if (shell.includes("fish")) {
      process.stdout.write(hookFish());
    } else {
      process.stdout.write(hookBash());
    }
    return 0;
  }

  if (sub === "install") {
    // Existing shim install logic
    const shimDir = join(homedir(), ".local", "bin");
    const { mkdirSync, writeFileSync, chmodSync } = await import("node:fs");
    mkdirSync(shimDir, { recursive: true });

    const cueBin = resolve(process.env.CUE_REPO_ROOT ?? join(homedir(), "Documents", "cue"), "bin", "cue");

    // Claude shim
    const claudeShim = `#!/usr/bin/env bash
exec "${cueBin}" launch claude "$@"
`;
    writeFileSync(join(shimDir, "claude"), claudeShim);
    chmodSync(join(shimDir, "claude"), 0o755);
    process.stdout.write(`✅ Installed claude shim → ${shimDir}/claude\n`);

    // Codex shim (optional)
    if (args.includes("--codex")) {
      const codexShim = `#!/usr/bin/env bash
exec "${cueBin}" launch codex "$@"
`;
      writeFileSync(join(shimDir, "codex"), codexShim);
      chmodSync(join(shimDir, "codex"), 0o755);
      process.stdout.write(`✅ Installed codex shim → ${shimDir}/codex\n`);
    }

    process.stdout.write(`\nAdd the shell hook to auto-switch profiles on cd:\n`);
    process.stdout.write(`  echo 'eval "$(cue shell hook)"' >> ~/.bashrc\n`);
    return 0;
  }

  process.stderr.write("Usage: cue shell hook    — output shell hook for eval\n");
  process.stderr.write("       cue shell install — install claude/codex shims\n");
  return 1;
}
