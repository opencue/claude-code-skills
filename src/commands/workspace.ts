/**
 * `cue workspace` — select a workspace within the active profile.
 *
 * Usage:
 *   cue workspace              — interactive TUI picker
 *   cue workspace <name>       — switch directly
 *   cue workspace --list       — show all workspaces
 *   cue workspace --current    — show active workspace
 *   cue workspace --status     — check env var status
 *   cue workspace add <name>   — add a new workspace interactively
 *   cue workspace clone <from> <to> — clone a workspace
 *   cue workspace share <name> — export to shared location
 *   cue workspace import <name> — import from shared location
 *   cue workspace secrets list|set|get|delete — manage encrypted secrets
 */

import * as p from "@clack/prompts";
import { existsSync, readFileSync, writeFileSync, appendFileSync, } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveProfileForCwd } from "../lib/cwd-resolver";
import {
  hasWorkspaces,
  loadWorkspaces,
  listWorkspaceIds,
  getWorkspace,
  getActiveWorkspace,
  setActiveWorkspace,
  saveWorkspace,
  exportWorkspace,
  importWorkspace,
  type Workspace,
} from "../lib/workspaces";

export async function run(args: string[]): Promise<number> {
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(`cue workspace — select a workspace within the active profile

Usage:
  cue workspace              Interactive picker
  cue workspace <name>       Switch directly
  cue workspace --list       Show all workspaces
  cue workspace --current    Show active workspace
  cue workspace --status     Check env var status for active workspace
  cue workspace add <name>   Add a new workspace interactively
  cue workspace clone <from> <to>  Clone a workspace
  cue workspace share <name>       Export workspace to shared location
  cue workspace import <name>      Import workspace from shared location
  cue workspace secrets <cmd>      Manage encrypted secrets (list|set|get|delete)

Workspaces are defined in profiles/<profile>/workspaces.yaml.
Each workspace pre-configures env vars (customer IDs, API keys)
and injects context (industry, market, language) into the persona.
`);
    return 0;
  }

  // Resolve active profile
  let profileName: string | undefined;
  try {
    const result = await resolveProfileForCwd({ cwd: process.cwd(), homeDir: homedir(), configDir: join(homedir(), ".config", "cue") });
    if (result.source !== "none") profileName = result.profile;
  } catch {}

  // Handle secrets subcommand (doesn't require a profile with workspaces)
  if (args[0] === "secrets") {
    return handleSecrets(args.slice(1));
  }

  if (!profileName) {
    process.stderr.write("No active profile. Run `cue use <profile>` first.\n");
    return 1;
  }

  // Subcommand routing
  if (args[0] === "add") return handleAdd(args.slice(1), profileName);
  if (args[0] === "clone") return handleClone(args.slice(1), profileName);
  if (args[0] === "share") return handleShare(args.slice(1), profileName);
  if (args[0] === "import") return handleImport(args.slice(1), profileName);
  if (args.includes("--status")) return handleStatus(profileName);

  if (!hasWorkspaces(profileName)) {
    process.stderr.write(`Profile "${profileName}" has no workspaces.yaml.\n`);
    process.stderr.write(`Create one at profiles/${profileName}/workspaces.yaml\n`);
    return 1;
  }

  const config = loadWorkspaces(profileName);
  if (!config?.workspaces || Object.keys(config.workspaces).length === 0) {
    process.stderr.write(`No workspaces defined in profiles/${profileName}/workspaces.yaml\n`);
    return 1;
  }

  // --current
  if (args.includes("--current")) {
    const active = getActiveWorkspace(profileName);
    if (active) {
      const ws = getWorkspace(profileName, active);
      process.stdout.write(`${active} — ${ws?.name ?? ""} (${ws?.url ?? ""})\n`);
    } else {
      process.stdout.write("No workspace selected.\n");
    }
    return 0;
  }

  // --list
  if (args.includes("--list")) {
    const active = getActiveWorkspace(profileName);
    const ids = listWorkspaceIds(profileName);
    process.stdout.write(`Workspaces for "${profileName}" (${ids.length}):\n\n`);
    for (const id of ids) {
      const ws = getWorkspace(profileName, id)!;
      const marker = id === active ? " ◀ active" : "";
      process.stdout.write(`  ${id.padEnd(20)} ${ws.name}${ws.url ? ` (${ws.url})` : ""}${marker}\n`);
    }
    return 0;
  }

  // Direct switch: cue workspace <name>
  const directName = args.find(a => !a.startsWith("-"));
  if (directName) {
    const ws = getWorkspace(profileName, directName);
    if (!ws) {
      process.stderr.write(`Workspace "${directName}" not found. Available: ${listWorkspaceIds(profileName).join(", ")}\n`);
      return 1;
    }
    setActiveWorkspace(profileName, directName);
    process.stdout.write(`✅ Switched to workspace: ${ws.name}${ws.url ? ` (${ws.url})` : ""}\n`);
    return 0;
  }

  // Interactive picker
  const ids = listWorkspaceIds(profileName);
  const active = getActiveWorkspace(profileName);

  p.intro(`🌐 Workspace selector for "${profileName}"`);

  const choice = await p.select({
    message: "Select workspace",
    options: ids.map(id => {
      const ws = getWorkspace(profileName!, id)!;
      return {
        value: id,
        label: `${ws.name}${ws.url ? ` — ${ws.url}` : ""}`,
        hint: id === active ? "current" : ws.description?.slice(0, 50),
      };
    }),
  });

  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    return 130;
  }

  setActiveWorkspace(profileName, choice as string);
  const ws = getWorkspace(profileName, choice as string)!;
  p.outro(`Switched to: ${ws.name}${ws.url ? ` (${ws.url})` : ""}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Feature 1: Add with auto .env.cue write
// ---------------------------------------------------------------------------

async function handleAdd(args: string[], profileName: string): Promise<number> {
  const newId = args[0];
  if (!newId) {
    process.stderr.write("Usage: cue workspace add <name>\n");
    return 1;
  }

  p.intro(`➕ Adding workspace "${newId}" to "${profileName}"`);

  const name = await p.text({ message: "Display name", placeholder: newId, initialValue: newId });
  if (p.isCancel(name)) { p.cancel("Cancelled."); return 130; }

  const description = await p.text({ message: "Description (what is this account/site?)", placeholder: "e.g. E-commerce tire shop" });
  if (p.isCancel(description)) { p.cancel("Cancelled."); return 130; }

  const url = await p.text({ message: "URL (optional)", placeholder: "https://example.com" });
  if (p.isCancel(url)) { p.cancel("Cancelled."); return 130; }

  const envKeyName = newId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const apiKeyVar = await p.text({
    message: "API key env var name",
    placeholder: `${envKeyName}_API_KEY`,
    initialValue: `${envKeyName}_API_KEY`,
  });
  if (p.isCancel(apiKeyVar)) { p.cancel("Cancelled."); return 130; }

  // Feature 1: Ask for actual value
  const apiKeyValue = await p.text({
    message: "API key value (optional — will be saved to ~/.env.cue)",
    placeholder: "pk_...",
  });
  if (p.isCancel(apiKeyValue)) { p.cancel("Cancelled."); return 130; }

  const context = await p.text({
    message: "Context (injected into persona — niche, voice, rules)",
    placeholder: "Niche: ...\nVoice: ...",
  });
  if (p.isCancel(context)) { p.cancel("Cancelled."); return 130; }

  // Build workspace object
  const ws: Workspace = {
    name: name as string,
    description: description as string || undefined,
    url: url as string || undefined,
    env: { [(apiKeyVar as string)]: `\${${apiKeyVar}}` },
    context: context as string || undefined,
  };

  saveWorkspace(profileName, newId, ws);
  p.log.success(`Added workspace "${newId}"`);

  // Feature 1: Write to ~/.env.cue if value provided
  if (apiKeyValue && (apiKeyValue as string).trim()) {
    const envCuePath = join(homedir(), ".env.cue");
    const line = `export ${apiKeyVar}="${apiKeyValue}"\n`;

    // Append or create ~/.env.cue
    if (existsSync(envCuePath)) {
      const existing = readFileSync(envCuePath, "utf8");
      if (!existing.includes(`export ${apiKeyVar}=`)) {
        appendFileSync(envCuePath, line);
      }
    } else {
      writeFileSync(envCuePath, line, { mode: 0o600 });
    }
    p.log.success(`Saved ${apiKeyVar} to ~/.env.cue`);

    // Offer to add source line to .bashrc
    const bashrcPath = join(homedir(), ".bashrc");
    const sourceLine = '[ -f ~/.env.cue ] && source ~/.env.cue';
    let alreadySourced = false;
    if (existsSync(bashrcPath)) {
      alreadySourced = readFileSync(bashrcPath, "utf8").includes(sourceLine);
    }

    if (!alreadySourced) {
      const addToBashrc = await p.confirm({
        message: "Add `source ~/.env.cue` to ~/.bashrc?",
        initialValue: true,
      });
      if (!p.isCancel(addToBashrc) && addToBashrc) {
        appendFileSync(bashrcPath, `\n# cue workspace env vars\n${sourceLine}\n`);
        p.log.success("Added source line to ~/.bashrc");
      }
    }
  } else {
    p.log.info(`Don't forget to set: export ${apiKeyVar}="..." in ~/.env.cue or .bashrc`);
  }

  const activate = await p.confirm({ message: `Switch to "${newId}" now?`, initialValue: true });
  if (!p.isCancel(activate) && activate) {
    setActiveWorkspace(profileName, newId);
    p.outro(`Switched to: ${name}`);
  } else {
    p.outro(`Done. Switch with: cue workspace ${newId}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Feature 3: Clone
// ---------------------------------------------------------------------------

async function handleClone(args: string[], profileName: string): Promise<number> {
  const [from, to] = args;
  if (!from || !to) {
    process.stderr.write("Usage: cue workspace clone <from> <to>\n");
    return 1;
  }

  const source = getWorkspace(profileName, from);
  if (!source) {
    process.stderr.write(`Workspace "${from}" not found.\n`);
    return 1;
  }

  if (getWorkspace(profileName, to)) {
    process.stderr.write(`Workspace "${to}" already exists.\n`);
    return 1;
  }

  p.intro(`📋 Cloning workspace "${from}" → "${to}"`);

  const newName = await p.text({
    message: "Display name for the clone",
    initialValue: `${source.name} (copy)`,
  });
  if (p.isCancel(newName)) { p.cancel("Cancelled."); return 130; }

  const envKeyName = to.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const newEnvVar = await p.text({
    message: "API key env var name for the clone",
    initialValue: `${envKeyName}_API_KEY`,
  });
  if (p.isCancel(newEnvVar)) { p.cancel("Cancelled."); return 130; }

  // Clone with updated name and env
  const cloned: Workspace = {
    ...source,
    name: newName as string,
    env: { ...(source.env ?? {}), [(Object.keys(source.env ?? {})[0] ?? "API_KEY")]: `\${${newEnvVar}}` },
  };

  saveWorkspace(profileName, to, cloned);
  p.outro(`✅ Cloned "${from}" → "${to}". Set: export ${newEnvVar}="..."`);
  return 0;
}

// ---------------------------------------------------------------------------
// Feature 5: Status
// ---------------------------------------------------------------------------

async function handleStatus(profileName: string): Promise<number> {
  const active = getActiveWorkspace(profileName);
  if (!active) {
    process.stdout.write("No active workspace.\n");
    return 0;
  }

  const ws = getWorkspace(profileName, active);
  if (!ws) {
    process.stdout.write(`Active workspace "${active}" not found in config.\n`);
    return 1;
  }

  process.stdout.write(`Workspace: ${ws.name} (${active})\n\n`);

  if (ws.env) {
    process.stdout.write("Environment variables:\n");
    for (const [key, val] of Object.entries(ws.env)) {
      // Check if the referenced env var is set
      // Handle ${VAR_NAME} references
      const refMatch = val.match(/\$\{([^}]+)\}/);
      const checkVar = refMatch ? refMatch[1]! : key;
      const isSet = !!process.env[checkVar];
      process.stdout.write(`  ${isSet ? "✅" : "❌"} ${checkVar}${isSet ? "" : " (not set)"}\n`);
    }
  }

  if (ws.url) {
    process.stdout.write(`\n  URL: ${ws.url}\n`);
  }

  if (ws.skills && ws.skills.length > 0) {
    process.stdout.write(`\n  Skills: ${ws.skills.join(", ")}\n`);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Feature 7: Share / Import
// ---------------------------------------------------------------------------

async function handleShare(args: string[], profileName: string): Promise<number> {
  const name = args[0];
  if (!name) {
    process.stderr.write("Usage: cue workspace share <name>\n");
    return 1;
  }
  if (exportWorkspace(profileName, name)) {
    process.stdout.write(`✅ Exported "${name}" to shared workspaces.\n`);
    return 0;
  }
  process.stderr.write(`Workspace "${name}" not found.\n`);
  return 1;
}

async function handleImport(args: string[], profileName: string): Promise<number> {
  const name = args[0];
  if (!name) {
    process.stderr.write("Usage: cue workspace import <name>\n");
    return 1;
  }
  if (importWorkspace(profileName, name)) {
    process.stdout.write(`✅ Imported "${name}" from shared workspaces.\n`);
    return 0;
  }
  process.stderr.write(`Shared workspace "${name}" not found.\n`);
  return 1;
}

// ---------------------------------------------------------------------------
// Feature 8: Secrets
// ---------------------------------------------------------------------------

async function handleSecrets(args: string[]): Promise<number> {
  const cmd = args[0];

  if (!cmd || cmd === "--help") {
    process.stdout.write(`cue workspace secrets — manage encrypted secrets

Usage:
  cue workspace secrets list              List secret names
  cue workspace secrets set <name> <val>  Store a secret
  cue workspace secrets get <name>        Retrieve a secret
  cue workspace secrets delete <name>     Remove a secret

Secrets are encrypted with age at ~/.config/cue/workspace-secrets.json.age.
Reference in workspace env with: secret:SECRET_NAME
`);
    return 0;
  }

  const { initSecretStore, setSecret, getSecret, listSecrets, deleteSecret } =
    await import("../lib/workspace-secrets");

  switch (cmd) {
    case "list": {
      try {
        const names = listSecrets();
        if (names.length === 0) {
          process.stdout.write("No secrets stored.\n");
        } else {
          process.stdout.write(`Secrets (${names.length}):\n`);
          for (const n of names) process.stdout.write(`  • ${n}\n`);
        }
      } catch (e: any) {
        process.stderr.write(`Error: ${e.message}\n`);
        return 1;
      }
      return 0;
    }
    case "set": {
      const name = args[1];
      const value = args[2];
      if (!name || !value) {
        process.stderr.write("Usage: cue workspace secrets set <name> <value>\n");
        return 1;
      }
      try {
        initSecretStore();
        setSecret(name, value);
        process.stdout.write(`✅ Secret "${name}" saved.\n`);
      } catch (e: any) {
        process.stderr.write(`Error: ${e.message}\n`);
        return 1;
      }
      return 0;
    }
    case "get": {
      const name = args[1];
      if (!name) {
        process.stderr.write("Usage: cue workspace secrets get <name>\n");
        return 1;
      }
      try {
        const val = getSecret(name);
        if (val === null) {
          process.stderr.write(`Secret "${name}" not found.\n`);
          return 1;
        }
        process.stdout.write(`${val}\n`);
      } catch (e: any) {
        process.stderr.write(`Error: ${e.message}\n`);
        return 1;
      }
      return 0;
    }
    case "delete": {
      const name = args[1];
      if (!name) {
        process.stderr.write("Usage: cue workspace secrets delete <name>\n");
        return 1;
      }
      try {
        deleteSecret(name);
        process.stdout.write(`✅ Secret "${name}" deleted.\n`);
      } catch (e: any) {
        process.stderr.write(`Error: ${e.message}\n`);
        return 1;
      }
      return 0;
    }
    default:
      process.stderr.write(`Unknown secrets command: ${cmd}\n`);
      return 1;
  }
}
