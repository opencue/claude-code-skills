/**
 * `cue completions [bash|zsh]` — output shell completion script.
 *
 * Usage:
 *   eval "$(cue completions bash)"   # add to ~/.bashrc
 *   eval "$(cue completions zsh)"    # add to ~/.zshrc
 */

import { COMMANDS } from "./_index";

const SKILLS_SUBCOMMANDS = [
  "list", "available", "search", "add", "add-to-profile",
  "remove-from-profile", "rank", "audit", "conflicts",
  "changelog", "test", "lint", "new", "pin", "rollback", "unpin",
];

function bashCompletion(): string {
  const cmds = Object.keys(COMMANDS).join(" ");
  const skillsSubs = SKILLS_SUBCOMMANDS.join(" ");

  return `# cue bash completion — eval "$(cue completions bash)"
_cue_completions() {
  local cur prev commands skills_subs
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="${cmds}"
  skills_subs="${skillsSubs}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    skills)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${skills_subs}" -- "\${cur}") )
      fi
      ;;
    use|optimizer|cost|tree|diff)
      # Complete with profile names
      local profiles
      profiles=$(cue list 2>/dev/null | awk '{print $2}')
      COMPREPLY=( $(compgen -W "\${profiles}" -- "\${cur}") )
      ;;
  esac
  return 0
}
complete -F _cue_completions cue
`;
}

function zshCompletion(): string {
  const cmds = Object.keys(COMMANDS);
  const cmdEntries = cmds.map((c) => `    '${c}:${COMMANDS[c as keyof typeof COMMANDS].summary.replace(/'/g, "")}'`).join("\n");
  const skillsSubs = SKILLS_SUBCOMMANDS.map((s) => `'${s}'`).join(" ");

  return `#compdef cue
# cue zsh completion — eval "$(cue completions zsh)"

_cue() {
  local -a commands skills_subs

  commands=(
${cmdEntries}
  )

  skills_subs=(${skillsSubs})

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'cue command' commands
      ;;
    args)
      case \${words[1]} in
        skills)
          _describe 'skills subcommand' skills_subs
          ;;
        use|optimizer|cost|tree|diff)
          local profiles
          profiles=(\${(f)"$(cue list 2>/dev/null | awk '{print $2}')"})
          _describe 'profile' profiles
          ;;
      esac
      ;;
  esac
}

_cue "$@"
`;
}

export function completionScript(shell: "bash" | "zsh"): string {
  return shell === "zsh" ? zshCompletion() : bashCompletion();
}

export async function run(args: string[]): Promise<number> {
  const shell = args[0] ?? (process.env.SHELL?.includes("zsh") ? "zsh" : "bash");

  if (shell === "zsh") {
    process.stdout.write(zshCompletion());
  } else if (shell === "bash") {
    process.stdout.write(bashCompletion());
  } else {
    process.stderr.write(`cue completions: unsupported shell "${shell}"\n`);
    process.stderr.write(`Supported: bash, zsh\n`);
    process.stderr.write(`Usage: eval "$(cue completions bash)"\n`);
    return 1;
  }
  return 0;
}
