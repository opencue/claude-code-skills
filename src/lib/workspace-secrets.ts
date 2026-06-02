/**
 * workspace-secrets — age-encrypted secret store for workspace env vars.
 *
 * Uses the `age` CLI for encryption. Secrets stored at
 * ~/.config/cue/workspace-secrets.age, key at ~/.config/cue/workspace-secrets.key.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

function configBase(): string {
  return process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? "~", ".config");
}

function secretsDir(): string {
  return join(configBase(), "cue");
}

function keyPath(): string {
  return join(secretsDir(), "workspace-secrets.key");
}

function storePath(): string {
  return join(secretsDir(), "workspace-secrets.json.age");
}

function hasAge(): boolean {
  try {
    execSync("which age", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function initSecretStore(): void {
  const dir = secretsDir();
  mkdirSync(dir, { recursive: true });

  if (!existsSync(keyPath())) {
    if (!hasAge()) {
      throw new Error("age CLI not found. Install with: apt install age / brew install age");
    }
    const key = execSync("age-keygen 2>/dev/null", { encoding: "utf8" });
    writeFileSync(keyPath(), key, { mode: 0o600 });
  }
}

function getPublicKey(): string {
  const content = readFileSync(keyPath(), "utf8");
  const match = content.match(/public key: (age1[a-z0-9]+)/);
  if (!match) throw new Error("Cannot parse public key from key file");
  return match[1]!;
}

function loadStore(): Record<string, string> {
  if (!existsSync(storePath())) return {};
  try {
    const decrypted = execSync(
      `age --decrypt -i "${keyPath()}" "${storePath()}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
}

function saveStore(data: Record<string, string>): void {
  initSecretStore();
  const pubKey = getPublicKey();
  const json = JSON.stringify(data, null, 2);
  execSync(
    `age --encrypt -r "${pubKey}" -o "${storePath()}"`,
    { input: json, stdio: ["pipe", "pipe", "pipe"] },
  );
}

export function setSecret(name: string, value: string): void {
  const store = loadStore();
  store[name] = value;
  saveStore(store);
}

export function getSecret(name: string): string | null {
  const store = loadStore();
  return store[name] ?? null;
}

export function listSecrets(): string[] {
  return Object.keys(loadStore());
}

export function deleteSecret(name: string): void {
  const store = loadStore();
  delete store[name];
  saveStore(store);
}
