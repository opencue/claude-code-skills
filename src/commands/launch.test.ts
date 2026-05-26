import { describe, expect, test } from "bun:test";
import {
  buildPickerSections,
  categoryBreakdown,
  computeTokenBreakdown,
  formatDoctorWarnings,
  formatProfileSummary,
  formatTokenWarning,
  getDefaultSelector,
  relativeTime,
  sortProfileOptions,
  splitSkillBytes,
  tokenLevelEmoji,
} from "./launch";
import { DIVIDER_PREFIX } from "../lib/picker";
import type { PickerOption } from "../lib/picker";
import type { ResolvedProfile } from "../../profiles/_types";

const make = (value: string): PickerOption => ({ value, label: value, hint: "" });

function makeProfile(overrides: Partial<ResolvedProfile> = {}): ResolvedProfile {
  return {
    name: "test",
    description: "",
    inherits: [],
    inheritanceChain: ["test"],
    agents: [],
    skills: { local: [], npx: [] },
    mcps: [],
    plugins: [],
    env: {},
    commands: [],
    rules: [],
    hooks: [],
    persona: "",
    playbooks: [],
    qualityGates: [],
    evals: [],
    recommends: [],
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

  test("top-flagged options sort above pinned and full", () => {
    const defaultOpt: PickerOption = { value: "core", label: "⭐ Default", hint: "", top: true };
    const input = [make("backend"), make("full"), make("frontend"), defaultOpt];
    const out = sortProfileOptions(input, "frontend");
    expect(out[0]!.value).toBe("core");
    expect(out[0]!.label).toBe("⭐ Default");
    expect(out[1]!.value).toBe("frontend"); // pinned still comes before usage/alpha
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-05-26T12:00:00Z").getTime();

  test("returns empty string for null/undefined/invalid", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });

  test("today / yesterday / Nd ago / ISO date", () => {
    expect(relativeTime("2026-05-26T08:00:00Z", now)).toBe("today");
    expect(relativeTime("2026-05-25T08:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-05-22T08:00:00Z", now)).toBe("4d ago");
    expect(relativeTime("2026-04-01T08:00:00Z", now)).toBe("2026-04-01");
  });
});

describe("buildPickerSections", () => {
  const opt = (value: string): PickerOption => ({ value, label: value, hint: "" });
  const now = new Date("2026-05-26T12:00:00Z").getTime();

  test("no usage: just Default + flat list, no Recent divider", () => {
    const all = [opt("backend"), opt("frontend"), opt("marketing")];
    const out = buildPickerSections(opt("__default"), all, [], 3, now);
    expect(out.map((o) => o.value)).toEqual([
      "__default",
      `${DIVIDER_PREFIX}all`,
      "backend",
      "frontend",
      "marketing",
    ]);
  });

  test("with recent: inserts Recent divider, omits recents from All section", () => {
    const all = [opt("backend"), opt("frontend"), opt("marketing"), opt("research")];
    const recent = [
      { name: "marketing", sessions: 8, lastUsed: "2026-05-26T08:00:00Z" },
      { name: "frontend", sessions: 5, lastUsed: "2026-05-25T08:00:00Z" },
      { name: "research", sessions: 2, lastUsed: "2026-05-22T08:00:00Z" },
    ];
    const out = buildPickerSections(opt("__default"), all, recent, 3, now);
    expect(out.map((o) => o.value)).toEqual([
      "__default",
      `${DIVIDER_PREFIX}recent`,
      "marketing",
      "frontend",
      "research",
      `${DIVIDER_PREFIX}all`,
      "backend",
    ]);
  });

  test("recent profile hints include session count and relative time", () => {
    const all = [opt("marketing")];
    const recent = [{ name: "marketing", sessions: 8, lastUsed: "2026-05-26T08:00:00Z" }];
    const out = buildPickerSections(opt("__default"), all, recent, 3, now);
    const marketing = out.find((o) => o.value === "marketing")!;
    expect(marketing.hint).toBe("8× sessions, last today");
  });

  test("singular session count gets singular noun", () => {
    const all = [opt("marketing")];
    const recent = [{ name: "marketing", sessions: 1, lastUsed: "2026-05-26T08:00:00Z" }];
    const out = buildPickerSections(opt("__default"), all, recent, 3, now);
    const marketing = out.find((o) => o.value === "marketing")!;
    expect(marketing.hint).toBe("1× session, last today");
  });

  test("dividers carry the divider flag and DIVIDER_PREFIX value", () => {
    const all = [opt("backend")];
    const recent = [{ name: "backend", sessions: 1, lastUsed: "2026-05-26T08:00:00Z" }];
    const out = buildPickerSections(opt("__default"), all, recent, 3, now);
    const recentDiv = out.find((o) => o.value === `${DIVIDER_PREFIX}recent`);
    expect(recentDiv?.divider).toBe(true);
    expect(recentDiv?.label).toBe("  ── Recent ──");
  });

  test("recent entries pointing at non-existent profiles are skipped", () => {
    const all = [opt("backend")];
    const recent = [
      { name: "ghost", sessions: 5, lastUsed: "2026-05-26T08:00:00Z" }, // not in all
      { name: "backend", sessions: 2, lastUsed: "2026-05-26T08:00:00Z" },
    ];
    const out = buildPickerSections(opt("__default"), all, recent, 3, now);
    expect(out.map((o) => o.value)).toEqual([
      "__default",
      `${DIVIDER_PREFIX}recent`,
      "backend",
    ]);
  });
});

describe("getDefaultSelector", () => {
  const reader = (contents: string) => (_path: string) => contents;
  const missing = (_path: string): string => { throw new Error("ENOENT"); };

  test("returns 'core' when no file exists", () => {
    expect(getDefaultSelector("/fake", missing)).toBe("core");
  });

  test("composes core + extras from one-per-line file", () => {
    expect(
      getDefaultSelector(
        "/fake",
        reader("core\nskill-writer\necc\n"),
      ),
    ).toBe("core+skill-writer+ecc");
  });

  test("ignores comments, blanks, and duplicate 'core'", () => {
    expect(
      getDefaultSelector(
        "/fake",
        reader("# header\ncore\n\nskill-writer  # my fav\ncore\necc\n"),
      ),
    ).toBe("core+skill-writer+ecc");
  });

  test("accepts '+'-separated form too", () => {
    expect(
      getDefaultSelector("/fake", reader("core+skill-writer+ecc")),
    ).toBe("core+skill-writer+ecc");
  });

  test("always prepends 'core' even if user removed it", () => {
    expect(
      getDefaultSelector("/fake", reader("skill-writer\necc\n")),
    ).toBe("core+skill-writer+ecc");
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

  test("composite breakdown shows per-part skill counts after the arrow", () => {
    const main = makeProfile({
      name: "skill-writer+core+ecc",
      skills: {
        local: Array.from({ length: 53 }, (_, i) => ({ id: `cat/skill-${i}` })),
        npx: [],
      },
    });
    const parts = [
      makeProfile({
        name: "skill-writer",
        skills: { local: Array.from({ length: 8 }, (_, i) => ({ id: `sw/${i}` })), npx: [] },
      }),
      makeProfile({
        name: "core",
        skills: { local: Array.from({ length: 12 }, (_, i) => ({ id: `c/${i}` })), npx: [] },
      }),
      makeProfile({
        name: "ecc",
        skills: { local: Array.from({ length: 33 }, (_, i) => ({ id: `e/${i}` })), npx: [] },
      }),
    ];
    const out = formatProfileSummary(main, parts);
    expect(out[0]).toBe("skills    53  ← skill-writer:8 + core:12 + ecc:33");
  });

  test("composite breakdown prefixes each part with its icon when set", () => {
    const main = makeProfile({
      skills: { local: Array.from({ length: 6 }, (_, i) => ({ id: `cat/x-${i}` })), npx: [] },
    });
    const parts = [
      makeProfile({
        name: "writer",
        icon: "🧬",
        skills: { local: [{ id: "a/1" }, { id: "a/2" }], npx: [] },
      }),
      makeProfile({
        name: "core",
        icon: "🐢",
        skills: { local: [{ id: "b/1" }, { id: "b/2" }], npx: [] },
      }),
    ];
    const out = formatProfileSummary(main, parts);
    expect(out[0]).toBe("skills    6  ← 🧬 writer:2 + 🐢 core:2");
  });

  test("adds category line below skills when localCount >= 5", () => {
    const profile = makeProfile({
      skills: {
        local: [
          { id: "meta/a" }, { id: "meta/b" }, { id: "meta/c" },
          { id: "review/x" }, { id: "review/y" },
          { id: "plan/p" },
        ],
        npx: [],
      },
    });
    const out = formatProfileSummary(profile);
    expect(out).toEqual([
      "skills    6",
      "          meta:3  review:2  plan:1",
    ]);
  });

  test("omits category line when fewer than 5 local skills", () => {
    const profile = makeProfile({
      skills: { local: [{ id: "a/x" }, { id: "b/y" }], npx: [] },
    });
    const out = formatProfileSummary(profile);
    expect(out).toEqual(["skills    2"]);
  });

  test("no composite breakdown when parts has a single entry", () => {
    const profile = makeProfile({
      name: "solo",
      skills: { local: [{ id: "a/x" }], npx: [] },
    });
    const out = formatProfileSummary(profile, [profile]);
    expect(out[0]).toBe("skills    1");
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

  test("renders commands as slash-prefixed list with basename stripped", () => {
    const out = formatProfileSummary(
      makeProfile({
        commands: [
          "resources/commands/code-review.md",
          "resources/commands/skill-lint.md",
          "careful.md",
        ],
      }),
    );
    expect(out).toEqual([
      "commands  /code-review  /skill-lint  /careful",
    ]);
  });

  test("renders agents separated by double-space", () => {
    const out = formatProfileSummary(
      makeProfile({ agents: ["claude-code", "codex"] }),
    );
    expect(out).toEqual(["agents    claude-code  codex"]);
  });

  test("wraps long command lists across multiple lines, indented under label", () => {
    const cmds = [
      "code-review", "checkpoint", "cue", "careful",
      "freeze", "unfreeze", "guard", "skill-lint",
      "feature-dev", "build-fix", "aside", "cost-report",
    ];
    const out = formatProfileSummary(makeProfile({ commands: cmds }));
    expect(out[0]).toBe(
      "commands  /code-review  /checkpoint  /cue  /careful\n" +
      "          /freeze  /unfreeze  /guard  /skill-lint\n" +
      "          /feature-dev  /build-fix  /aside  /cost-report",
    );
  });
});

describe("categoryBreakdown", () => {
  test("groups by leading segment, sorted by descending count", () => {
    expect(
      categoryBreakdown([
        "meta/a", "meta/b", "meta/c",
        "review/x", "review/y",
        "plan/p",
        "rogue", // no slash → "other"
      ]),
    ).toBe("meta:3  review:2  plan:1  other:1");
  });

  test("truncates beyond `max` with a +N cats footer", () => {
    const ids = [
      ...Array(8).fill("a/x"),
      ...Array(7).fill("b/x"),
      ...Array(1).fill("c/x"),
      ...Array(1).fill("d/x"),
      ...Array(1).fill("e/x"),
      ...Array(1).fill("f/x"),
      ...Array(1).fill("g/x"),
      ...Array(1).fill("h/x"),
      ...Array(1).fill("i/x"),
    ];
    expect(categoryBreakdown(ids)).toBe(
      "a:8  b:7  c:1  d:1  e:1  f:1  g:1  +2 cats",
    );
  });

  test("returns empty string for no input", () => {
    expect(categoryBreakdown([])).toBe("");
  });
});

describe("splitSkillBytes", () => {
  test("splits at the closing --- and counts each side", () => {
    const fm = "---\nname: foo\ndescription: bar\n---\n";
    const body = "# Heading\n\nbody text here";
    const out = splitSkillBytes(fm + body);
    expect(out.frontmatter).toBe(fm.length);
    expect(out.body).toBe(body.length);
  });

  test("no frontmatter delimiter: counts everything as body", () => {
    const src = "# just a markdown file\nno frontmatter";
    expect(splitSkillBytes(src)).toEqual({ frontmatter: 0, body: src.length });
  });
});

describe("computeTokenBreakdown", () => {
  // Each test skill: 100 tok frontmatter, body varies. Keeps math obvious.
  const tokens = (bodies: Record<string, number>) =>
    (id: string): { frontmatter: number; body: number } =>
      bodies[id] !== undefined ? { frontmatter: 100, body: bodies[id]! } : { frontmatter: 0, body: 0 };

  test("single profile: alwaysOn = sum of frontmatter, maxIfAllActivate = sum of bodies", () => {
    const profile = makeProfile({
      skills: { local: [{ id: "a/x" }, { id: "a/y" }, { id: "a/z" }], npx: [] },
    });
    const b = computeTokenBreakdown(profile, undefined, tokens({ "a/x": 1000, "a/y": 5000, "a/z": 3000 }));
    expect(b.alwaysOn).toBe(300);
    expect(b.maxIfAllActivate).toBe(9000);
    expect(b.totalSkills).toBe(3);
    expect(b.byProfile).toEqual([]);
    expect(b.heaviestBodies.map((s) => s.id)).toEqual(["a/y", "a/z", "a/x"]);
  });

  test("composite: per-profile alwaysOn dedupes overlap (first-wins)", () => {
    const writer = makeProfile({
      name: "writer",
      skills: { local: [{ id: "w/1" }, { id: "shared/x" }], npx: [] },
    });
    const core = makeProfile({
      name: "core",
      skills: { local: [{ id: "c/1" }, { id: "shared/x" }], npx: [] }, // overlap -> credited to writer
    });
    const ecc = makeProfile({
      name: "ecc",
      skills: { local: [{ id: "e/1" }, { id: "e/2" }, { id: "e/3" }], npx: [] },
    });
    const merged = makeProfile({
      skills: {
        local: [{ id: "w/1" }, { id: "shared/x" }, { id: "c/1" }, { id: "e/1" }, { id: "e/2" }, { id: "e/3" }],
        npx: [],
      },
    });
    const b = computeTokenBreakdown(merged, [writer, core, ecc], tokens({
      "w/1": 1000, "shared/x": 2000, "c/1": 5000, "e/1": 8000, "e/2": 5000, "e/3": 3000,
    }));
    // 6 skills * 100 = 600 frontmatter
    expect(b.alwaysOn).toBe(600);
    expect(b.byProfile).toEqual([
      { name: "writer", tokens: 200, skillCount: 2 }, // w/1 + shared/x
      { name: "core", tokens: 100, skillCount: 1 },   // c/1 only
      { name: "ecc", tokens: 300, skillCount: 3 },    // e/1 + e/2 + e/3
    ]);
  });
});

describe("tokenLevelEmoji", () => {
  test("maps each threshold band to the right dot", () => {
    expect(tokenLevelEmoji(0)).toBe("🟢");
    expect(tokenLevelEmoji(5000)).toBe("🟢"); // boundary: not > 5000
    expect(tokenLevelEmoji(5001)).toBe("🟡");
    expect(tokenLevelEmoji(10000)).toBe("🟡"); // boundary
    expect(tokenLevelEmoji(10001)).toBe("🟠");
    expect(tokenLevelEmoji(15000)).toBe("🟠"); // boundary
    expect(tokenLevelEmoji(15001)).toBe("🔴");
    expect(tokenLevelEmoji(50000)).toBe("🔴");
  });

  test("matches the dot used by formatTokenWarning's header", () => {
    // Cross-check: if the helper and formatTokenWarning ever drift, this fails.
    const out = formatTokenWarning({
      alwaysOn: 12000,
      maxIfAllActivate: 80000,
      totalSkills: 30,
      byProfile: [],
      heaviestBodies: [],
    });
    expect(out[0]).toContain(tokenLevelEmoji(12000));
  });
});

describe("formatTokenWarning", () => {
  test("returns no lines below the 2K always-on floor", () => {
    const out = formatTokenWarning({
      alwaysOn: 1500, maxIfAllActivate: 50000, totalSkills: 20, byProfile: [], heaviestBodies: [],
    });
    expect(out).toEqual([]);
  });

  test("composite: emits always-on header, By profile, max-if-active, heaviest, and Drop hint", () => {
    const out = formatTokenWarning({
      alwaysOn: 8000,
      maxIfAllActivate: 230000,
      totalSkills: 53,
      byProfile: [
        { name: "skill-writer", tokens: 1500, skillCount: 8 },
        { name: "core", tokens: 1800, skillCount: 12 },
        { name: "ecc", tokens: 4700, skillCount: 33 },
      ],
      heaviestBodies: [
        { id: "meta/skill-reviewer", tokens: 18000 },
        { id: "review/code-review-deep", tokens: 12000 },
        { id: "plan/autoplan", tokens: 9000 },
      ],
    });
    expect(out).toEqual([
      "🟡 Skill overhead: ~8.0K always-on (53 skills)",
      "   By profile:  skill-writer 1.5K  ·  core 1.8K  ·  ecc 4.7K ← heaviest",
      "   ~230K max if every skill activates (bodies load on demand)",
      "   Heaviest bodies:  skill-reviewer (18.0K), code-review-deep (12.0K), autoplan (9.0K)",
      `   💡 Drop "ecc" to save ~4.7K always-on`,
    ]);
  });

  test("By profile line prefixes each part with its icon when set", () => {
    const out = formatTokenWarning({
      alwaysOn: 6000,
      maxIfAllActivate: 80000,
      totalSkills: 20,
      byProfile: [
        { name: "writer", icon: "🧬", tokens: 1500, skillCount: 6 },
        { name: "core", icon: "🐢", tokens: 1500, skillCount: 6 },
        { name: "ecc", icon: "🦅", tokens: 3000, skillCount: 8 },
      ],
      heaviestBodies: [],
    });
    expect(out[1]).toBe(
      "   By profile:  🧬 writer 1.5K  ·  🐢 core 1.5K  ·  🦅 ecc 3.0K ← heaviest",
    );
  });

  test("primary is heaviest: never suggests dropping it, falls back to audit hint when warranted", () => {
    // Scenario: user picked `postizz` (heaviest) and combined with blog-writer
    // + trendradar. Suggesting "Drop postizz" would be nonsensical.
    const out = formatTokenWarning({
      alwaysOn: 11000,
      maxIfAllActivate: 49000,
      totalSkills: 39,
      byProfile: [
        { name: "postizz", icon: "📮", tokens: 3700, skillCount: 12 },
        { name: "blog-writer", icon: "✍️", tokens: 0, skillCount: 0 },
        { name: "trendradar", icon: "📡", tokens: 1000, skillCount: 4 },
      ],
      heaviestBodies: [{ id: "meta/skill-reviewer", tokens: 4000 }],
    });
    expect(out.join("\n")).not.toContain(`Drop "postizz"`);
    expect(out).toContain("   💡 Run `cue skills audit` to trim unused skills.");
  });

  test("primary is heaviest but a companion is also above 3K: suggests dropping the companion", () => {
    const out = formatTokenWarning({
      alwaysOn: 12000,
      maxIfAllActivate: 80000,
      totalSkills: 40,
      byProfile: [
        { name: "primary", tokens: 6000, skillCount: 20 },
        { name: "companion", tokens: 4000, skillCount: 15 },
      ],
      heaviestBodies: [],
    });
    expect(out).toContain(`   💡 Drop "companion" to save ~4.0K always-on`);
    expect(out.join("\n")).not.toContain(`Drop "primary"`);
  });

  test("single profile above 10K always-on: shows audit hint, not Drop hint", () => {
    const out = formatTokenWarning({
      alwaysOn: 12000, maxIfAllActivate: 200000, totalSkills: 80, byProfile: [],
      heaviestBodies: [{ id: "x/y", tokens: 5000 }],
    });
    expect(out).toContain("   💡 Run `cue skills audit` to trim unused skills.");
  });
});

describe("formatDoctorWarnings", () => {
  test("returns [] for no warnings", () => {
    expect(formatDoctorWarnings([])).toEqual([]);
  });

  test("singular 'warning' for exactly one", () => {
    const out = formatDoctorWarnings([{ code: "D1", message: `skill "meta/foo" not found on disk` }]);
    expect(out).toEqual([
      "⚠ cue doctor (1 warning):",
      `   D1  skill "meta/foo" not found on disk`,
      "   → cue doctor --fix",
    ]);
  });

  test("shows top 3 inline plus a '…and N more' footer when over 3", () => {
    const out = formatDoctorWarnings([
      { code: "D1", message: `skill "meta/foo" not found on disk` },
      { code: "D2", message: `MCP "obsidian" not in registry` },
      { code: "D4", message: `skill "vps" needs MCP "hostinger" (from profile)` },
      { code: "D2", message: `MCP "extra" not in registry` },
      { code: "D5", message: `runtime missing hash (may be stale)` },
    ]);
    expect(out).toEqual([
      "⚠ cue doctor (5 warnings):",
      `   D1  skill "meta/foo" not found on disk`,
      `   D2  MCP "obsidian" not in registry`,
      `   D4  skill "vps" needs MCP "hostinger" (from profile)`,
      "   …and 2 more",
      "   → cue doctor --fix",
    ]);
  });
});
