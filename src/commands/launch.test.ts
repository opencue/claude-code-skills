import { describe, expect, test } from "bun:test";
import { formatProfileSummary, sortProfileOptions } from "./launch";
import type { PickerOption } from "../lib/picker";
import type { ResolvedProfile } from "../../profiles/_types";

const make = (value: string): PickerOption => ({ value, label: value, hint: "" });

function makeProfile(overrides: Partial<ResolvedProfile> = {}): ResolvedProfile {
  return {
    name: "test",
    description: "",
    inherits: [],
    inheritanceChain: ["test"],
    agents: ["claude-code"],
    skills: { local: [], npx: [] },
    mcps: [],
    plugins: [],
    env: {},
    ...overrides,
  } as ResolvedProfile;
}

describe("sortProfileOptions", () => {
  test("pinned profile is first", () => {
    const input = [make("backend"), make("frontend"), make("full"), make("marketing")];
    const out = sortProfileOptions(input, "marketing");
    expect(out.map((o) => o.value)).toEqual(["marketing", "full", "backend", "frontend"]);
  });

  test("full is second when pinned profile is set", () => {
    const input = [make("backend"), make("frontend"), make("full")];
    const out = sortProfileOptions(input, "frontend");
    expect(out[0]!.value).toBe("frontend");
    expect(out[1]!.value).toBe("full");
  });

  test("full is first when no pinned profile", () => {
    const input = [make("backend"), make("research"), make("full"), make("marketing")];
    const out = sortProfileOptions(input);
    expect(out[0]!.value).toBe("full");
    // Rest are alphabetical
    expect(out.slice(1).map((o) => o.value)).toEqual(["backend", "marketing", "research"]);
  });

  test("works when pinned profile equals 'full'", () => {
    const input = [make("backend"), make("frontend"), make("full")];
    const out = sortProfileOptions(input, "full");
    expect(out[0]!.value).toBe("full");
  });

  test("does not mutate the input array", () => {
    const input = [make("backend"), make("full"), make("frontend")];
    const before = input.map((o) => o.value);
    sortProfileOptions(input, "frontend");
    expect(input.map((o) => o.value)).toEqual(before);
  });

  test("alphabetical tie-break for non-special profiles", () => {
    const input = [make("zebra"), make("apple"), make("mango")];
    const out = sortProfileOptions(input);
    expect(out.map((o) => o.value)).toEqual(["apple", "mango", "zebra"]);
  });
});


describe("formatProfileSummary", () => {
  test("empty profile returns no lines", () => {
    expect(formatProfileSummary(makeProfile())).toEqual([]);
  });

  test("counts skills and lists mcps + plugins", () => {
    const out = formatProfileSummary(
      makeProfile({
        skills: {
          local: [{ id: "github/github" }, { id: "deployment/coolify" }],
          npx: [],
        },
        mcps: [{ id: "claude-mem" }, { id: "gbrain" }],
        plugins: [{ id: "cue" }],
      }),
    );
    expect(out).toEqual([
      "skills    2",
      "mcps      claude-mem, gbrain",
      "plugins   cue",
    ]);
  });

  test("breaks down local vs npx when both present", () => {
    const out = formatProfileSummary(
      makeProfile({
        skills: {
          local: [{ id: "a/x" }, { id: "a/y" }],
          npx: [{ source: { repo: "owner/r", pin: "v1" }, skills: [{ name: "z" }] } as never],
        },
      }),
    );
    expect(out[0]).toBe("skills    3 (2 local, 1 npx)");
  });

  test("truncates long mcp lists with '+N more'", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `mcp-${i}`);
    const out = formatProfileSummary(makeProfile({ mcps: ids.map((id) => ({ id })) }));
    expect(out[0]).toMatch(/^mcps      mcp-0, mcp-1, mcp-2, mcp-3, mcp-4, mcp-5, mcp-6, mcp-7, \+4 more$/);
  });

  test("omits sections that are empty", () => {
    const out = formatProfileSummary(
      makeProfile({
        skills: { local: [{ id: "a/x" }], npx: [] },
        // no mcps, no plugins
      }),
    );
    expect(out).toEqual(["skills    1"]);
  });
});
