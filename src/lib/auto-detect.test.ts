import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectProfile, detectProfileV2 } from "./auto-detect";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cue-detect-"));
});
afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

describe("detectProfileV2", () => {
  test("Cargo.toml → rust with 0.9 confidence", () => {
    writeFileSync(join(tmp, "Cargo.toml"), "[package]");
    const results = detectProfileV2(tmp);
    const rust = results.find(r => r.profile === "rust");
    expect(rust).toBeDefined();
    expect(rust!.confidence).toBe(0.9);
    expect(rust!.reasons).toContain("Cargo.toml");
  });

  test("Cargo.toml + src/main.rs → rust, corroborated above the lone-signal base", () => {
    writeFileSync(join(tmp, "Cargo.toml"), "[package]");
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/main.rs"), "fn main() {}");
    const results = detectProfileV2(tmp);
    const rust = results.find(r => r.profile === "rust");
    expect(rust).toBeDefined();
    expect(rust!.reasons).toContain("src/main.rs");
    // Two corroborating signals (Cargo.toml + src/main.rs) lift confidence
    // above the 0.9 lone-signal base, capped at 0.97.
    expect(rust!.confidence).toBeGreaterThan(0.9);
    expect(rust!.confidence).toBeLessThanOrEqual(0.97);
    // `rust-cli` was a phantom profile (no profiles/rust-cli on disk) — gone now.
    expect(results.find(r => r.profile === "rust-cli")).toBeUndefined();
  });

  test("package.json with next → nextjs 0.9", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { next: "14.0.0" } }));
    const results = detectProfileV2(tmp);
    const nextjs = results.find(r => r.profile === "nextjs");
    expect(nextjs).toBeDefined();
    expect(nextjs!.confidence).toBe(0.9);
  });

  test("package.json with react (no next) → frontend 0.8", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { react: "18.0.0" } }));
    const results = detectProfileV2(tmp);
    const frontend = results.find(r => r.profile === "frontend");
    expect(frontend).toBeDefined();
    expect(frontend!.confidence).toBe(0.8);
  });

  test("package.json with no framework → backend 0.6", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { express: "4.0.0" } }));
    const results = detectProfileV2(tmp);
    const backend = results.find(r => r.profile === "backend");
    expect(backend).toBeDefined();
    expect(backend!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test("go.mod → go-api 0.8", () => {
    writeFileSync(join(tmp, "go.mod"), "module example.com/app");
    const results = detectProfileV2(tmp);
    const goApi = results.find(r => r.profile === "go-api");
    expect(goApi).toBeDefined();
    expect(goApi!.confidence).toBe(0.8);
  });

  test("empty dir returns empty", () => {
    const results = detectProfileV2(tmp);
    expect(results).toEqual([]);
  });

  test("medusa-config.ts → medusa-dev 0.9", () => {
    writeFileSync(join(tmp, "medusa-config.ts"), "export default {}");
    const results = detectProfileV2(tmp);
    const medusa = results.find(r => r.profile === "medusa-dev");
    expect(medusa).toBeDefined();
    expect(medusa!.confidence).toBe(0.9);
  });

  test("@medusajs/* dep + vite → medusa-vite storefront", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({
      dependencies: { "@medusajs/js-sdk": "2.0.0", vite: "5.0.0" },
    }));
    const results = detectProfileV2(tmp);
    const vite = results.find(r => r.profile === "medusa-vite");
    expect(vite).toBeDefined();
  });

  test("corroborating signals boost confidence above the lone-signal base", () => {
    // next.config.* alone is 0.85; package.json `next` alone is 0.9. Together
    // they corroborate and should clear the lone-signal 0.9.
    writeFileSync(join(tmp, "next.config.ts"), "export default {}");
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { next: "14" } }));
    const results = detectProfileV2(tmp);
    const nextjs = results.find(r => r.profile === "nextjs");
    expect(nextjs).toBeDefined();
    expect(nextjs!.confidence).toBeGreaterThan(0.9);
    expect(nextjs!.confidence).toBeLessThanOrEqual(0.97);
  });

  test("confidence never exceeds the 0.97 cap", () => {
    writeFileSync(join(tmp, "go.mod"), "module x");
    writeFileSync(join(tmp, "go.sum"), "");
    writeFileSync(join(tmp, "main.go"), "package main");
    mkdirSync(join(tmp, "cmd"));
    mkdirSync(join(tmp, "internal"));
    const results = detectProfileV2(tmp);
    for (const r of results) expect(r.confidence).toBeLessThanOrEqual(0.97);
  });

  test("results sorted by confidence descending, max 5", () => {
    writeFileSync(join(tmp, "Cargo.toml"), "");
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/main.rs"), "");
    writeFileSync(join(tmp, "go.mod"), "");
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { next: "14" } }));
    mkdirSync(join(tmp, ".github"));
    mkdirSync(join(tmp, ".github/workflows"));
    const results = detectProfileV2(tmp);
    expect(results.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.confidence).toBeLessThanOrEqual(results[i - 1]!.confidence);
    }
  });
});

describe("detectProfile (v1 compat)", () => {
  test("returns results with confidence 0-100", () => {
    writeFileSync(join(tmp, "Cargo.toml"), "");
    const results = detectProfile(tmp);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.confidence).toBeGreaterThan(0);
    expect(results[0]!.confidence).toBeLessThanOrEqual(100);
  });
});
