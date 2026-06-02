import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { cacheDir, configDir } from "./config-paths";

// configDir/cacheDir read process.env; snapshot + restore so tests don't leak.
const SAVED = {
  config: process.env.XDG_CONFIG_HOME,
  cache: process.env.XDG_CACHE_HOME,
};

describe("config-paths", () => {
  beforeEach(() => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CACHE_HOME;
  });
  afterEach(() => {
    if (SAVED.config === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = SAVED.config;
    if (SAVED.cache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = SAVED.cache;
  });

  test("configDir falls back to ~/.config/cue when XDG unset", () => {
    expect(configDir()).toBe(join(homedir(), ".config", "cue"));
  });

  test("configDir honors a set XDG_CONFIG_HOME", () => {
    process.env.XDG_CONFIG_HOME = "/custom/xdg";
    expect(configDir()).toBe(join("/custom/xdg", "cue"));
  });

  // The bug this module fixes: a set-but-empty XDG must NOT resolve to a
  // relative "cue" path (the old `XDG ? join(XDG,"cue") : ...` variant did).
  test("configDir treats an empty XDG_CONFIG_HOME as unset (absolute, not relative)", () => {
    process.env.XDG_CONFIG_HOME = "";
    const dir = configDir();
    expect(dir).toBe(join(homedir(), ".config", "cue"));
    expect(dir.startsWith("/")).toBe(true);
  });

  test("cacheDir falls back to ~/.cache/cue and honors XDG_CACHE_HOME", () => {
    expect(cacheDir()).toBe(join(homedir(), ".cache", "cue"));
    process.env.XDG_CACHE_HOME = "/c";
    expect(cacheDir()).toBe(join("/c", "cue"));
  });

  test("cacheDir treats an empty XDG_CACHE_HOME as unset", () => {
    process.env.XDG_CACHE_HOME = "";
    expect(cacheDir()).toBe(join(homedir(), ".cache", "cue"));
  });
});
