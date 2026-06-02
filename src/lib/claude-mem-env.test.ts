import { describe, expect, test } from "bun:test";

import {
  assignPorts,
  claudeMemDataDir,
  type PortRegistry,
  portsForSlot,
  resolveClaudeMemEnv,
} from "./claude-mem-env";

describe("portsForSlot", () => {
  test("slot 0 → worker 30000 / server 30001", () => {
    expect(portsForSlot(0)).toEqual({ worker: 30000, server: 30001 });
  });

  test("consecutive slots never overlap (worker even, server odd, +2 per slot)", () => {
    expect(portsForSlot(5)).toEqual({ worker: 30010, server: 30011 });
    // slot N's server (30000+2N+1) is always below slot N+1's worker (30000+2N+2)
    expect(portsForSlot(5).server).toBeLessThan(portsForSlot(6).worker);
  });

  test("stays below the Linux ephemeral range for any realistic slot", () => {
    expect(portsForSlot(999).server).toBeLessThan(32768);
  });
});

describe("assignPorts", () => {
  test("assigns the lowest free slot to a new profile and does not mutate input", () => {
    const reg: PortRegistry = { version: 1, slots: {} };
    const out = assignPorts(reg, "backend");
    expect(out.assigned).toBe(true);
    expect(out.ports).toEqual({ worker: 30000, server: 30001 });
    expect(out.registry.slots).toEqual({ backend: 0 });
    expect(reg.slots).toEqual({}); // input untouched
  });

  test("returns the same ports (and assigned=false) for an already-known profile", () => {
    const reg: PortRegistry = { version: 1, slots: { backend: 3 } };
    const out = assignPorts(reg, "backend");
    expect(out.assigned).toBe(false);
    expect(out.ports).toEqual(portsForSlot(3));
    expect(out.registry).toBe(reg); // unchanged reference
  });

  test("fills the lowest gap rather than appending", () => {
    const reg: PortRegistry = { version: 1, slots: { a: 0, c: 2 } };
    const out = assignPorts(reg, "b");
    expect(out.registry.slots.b).toBe(1);
  });

  test("distinct profiles get distinct, non-overlapping ports", () => {
    let reg: PortRegistry = { version: 1, slots: {} };
    const a = assignPorts(reg, "frontend");
    reg = a.registry;
    const b = assignPorts(reg, "secops");
    const ports = [a.ports.worker, a.ports.server, b.ports.worker, b.ports.server];
    expect(new Set(ports).size).toBe(4);
  });
});

describe("claudeMemDataDir", () => {
  test("nests the profile under <home>/.claude-mem/profiles", () => {
    expect(claudeMemDataDir("backend", "/home/u")).toBe("/home/u/.claude-mem/profiles/backend");
  });

  test("keeps + and @ (real profile names) but sanitizes path separators", () => {
    expect(claudeMemDataDir("gstack+skill-writer", "/home/u")).toBe(
      "/home/u/.claude-mem/profiles/gstack+skill-writer",
    );
    expect(claudeMemDataDir("a/b", "/home/u")).toBe("/home/u/.claude-mem/profiles/a_b");
  });
});

describe("resolveClaudeMemEnv", () => {
  const inMemoryRegistry = () => {
    let reg: PortRegistry = { version: 1, slots: {} };
    return {
      readRegistry: () => reg,
      writeRegistry: (r: PortRegistry) => {
        reg = r;
      },
      current: () => reg,
    };
  };

  test("returns null when isolation is opted out", () => {
    const out = resolveClaudeMemEnv("backend", {
      home: "/home/u",
      existingEnv: { CUE_CLAUDE_MEM_ISOLATE: "0" },
    });
    expect(out).toBeNull();
  });

  test("returns null when the user already manages CLAUDE_MEM_* by hand", () => {
    const out = resolveClaudeMemEnv("backend", {
      home: "/home/u",
      existingEnv: { CLAUDE_MEM_DATA_DIR: "/custom" },
    });
    expect(out).toBeNull();
  });

  test("produces the SQLite-only overlay and persists a new slot", () => {
    const io = inMemoryRegistry();
    const out = resolveClaudeMemEnv("backend", {
      home: "/home/u",
      existingEnv: {},
      readRegistry: io.readRegistry,
      writeRegistry: io.writeRegistry,
    });
    expect(out).toEqual({
      CLAUDE_MEM_DATA_DIR: "/home/u/.claude-mem/profiles/backend",
      CLAUDE_MEM_CHROMA_ENABLED: "false",
      CLAUDE_MEM_WORKER_PORT: "30000",
      CLAUDE_MEM_SERVER_PORT: "30001",
    });
    expect(io.current().slots).toEqual({ backend: 0 });
  });

  test("is stable across calls for the same profile (no re-allocation)", () => {
    const io = inMemoryRegistry();
    const first = resolveClaudeMemEnv("backend", {
      home: "/home/u",
      existingEnv: {},
      readRegistry: io.readRegistry,
      writeRegistry: io.writeRegistry,
    });
    const second = resolveClaudeMemEnv("backend", {
      home: "/home/u",
      existingEnv: {},
      readRegistry: io.readRegistry,
      writeRegistry: io.writeRegistry,
    });
    expect(second).toEqual(first);
  });

  test("two profiles get different ports", () => {
    const io = inMemoryRegistry();
    const opts = {
      home: "/home/u",
      existingEnv: {},
      readRegistry: io.readRegistry,
      writeRegistry: io.writeRegistry,
    };
    const a = resolveClaudeMemEnv("frontend", opts);
    const b = resolveClaudeMemEnv("secops", opts);
    expect(a?.CLAUDE_MEM_WORKER_PORT).not.toBe(b?.CLAUDE_MEM_WORKER_PORT);
  });
});
