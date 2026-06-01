import { describe, expect, test } from "bun:test";

import {
  filterOptions,
  renderProfileList,
  resolveConflicts,
  windowOptions,
  type PickerOption,
} from "./picker";

describe("renderProfileList", () => {
  test("formats option label and description", () => {
    const opts: PickerOption[] = [
      { value: "frontend", label: "frontend", hint: "Frontend UI work" },
      { value: "backend", label: "backend", hint: "API/server work" },
    ];
    const rendered = renderProfileList(opts, { cwd: "/tmp/proj" });
    expect(rendered).toContain("cue · pick a profile");
    expect(rendered).toContain("/tmp/proj");
    expect(rendered).toContain("frontend");
    expect(rendered).toContain("Frontend UI work");
    expect(rendered).toContain("backend");
  });

  test("includes special entries for new profile and details", () => {
    const opts: PickerOption[] = [
      { value: "frontend", label: "frontend", hint: "Frontend UI work" },
    ];
    const rendered = renderProfileList(opts, { cwd: "/tmp/proj", includeFooter: true });
    expect(rendered).toMatch(/new profile from this cwd/);
    expect(rendered).toMatch(/details \(d\)/);
    expect(rendered).toMatch(/pick once, no pin \(n\)/);
  });
});

describe("filterOptions", () => {
  const opts: PickerOption[] = [
    { value: "default", label: "★ Default", hint: "core", top: true },
    { value: "__divider_featured", label: "— Featured —", hint: "", divider: true },
    { value: "studio", label: "🎨 studio", hint: "" },
    { value: "secops", label: "🔒 secops", hint: "" },
    { value: "slack", label: "💬 slack", hint: "" },
    { value: "stripe", label: "💳 stripe", hint: "" },
    { value: "growth", label: "🦜 growth", hint: "" },
    { value: "webshop-google", label: "📊 webshop-google", hint: "" },
  ];

  test("empty query returns everything; dividers stay but are not selectable", () => {
    const { display, selectable } = filterOptions(opts, "");
    expect(display).toEqual(opts);
    expect(selectable.some((o) => o.divider)).toBe(false);
    expect(selectable).toHaveLength(7);
  });

  test("query filters to value-prefix matches and drops dividers", () => {
    const { display, selectable } = filterOptions(opts, "s");
    expect(display.map((o) => o.value)).toEqual(["studio", "secops", "slack", "stripe"]);
    expect(display.some((o) => o.divider)).toBe(false);
    expect(selectable).toEqual(display);
  });

  test("query is case-insensitive and trimmed", () => {
    expect(filterOptions(opts, "  ST ").display.map((o) => o.value)).toEqual([
      "studio",
      "stripe",
    ]);
  });

  test("falls back to substring match when nothing starts with the query", () => {
    // No value starts with "google", but webshop-google contains it.
    expect(filterOptions(opts, "google").display.map((o) => o.value)).toEqual([
      "webshop-google",
    ]);
  });

  test("no match returns an empty list", () => {
    expect(filterOptions(opts, "zzz").display).toHaveLength(0);
    expect(filterOptions(opts, "zzz").selectable).toHaveLength(0);
  });
});

describe("windowOptions", () => {
  const nums = Array.from({ length: 20 }, (_, i) => i);

  test("returns everything with no hidden when the list fits", () => {
    const w = windowOptions(nums.slice(0, 5), 2, 10);
    expect(w.items).toEqual([0, 1, 2, 3, 4]);
    expect(w.hiddenAbove).toBe(0);
    expect(w.hiddenBelow).toBe(0);
  });

  test("centers the active row in the middle of the window", () => {
    const w = windowOptions(nums, 10, 7);
    // window of 7 centered on index 10 → start = 10 - 3 = 7, items 7..13
    expect(w.start).toBe(7);
    expect(w.items).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(w.hiddenAbove).toBe(7);
    expect(w.hiddenBelow).toBe(6);
  });

  test("pins to the top when the active row is near the start", () => {
    const w = windowOptions(nums, 1, 7);
    expect(w.start).toBe(0);
    expect(w.hiddenAbove).toBe(0);
    expect(w.items[0]).toBe(0);
  });

  test("pins to the bottom so the last rows stay reachable", () => {
    const w = windowOptions(nums, 19, 7);
    expect(w.start).toBe(13); // 20 - 7
    expect(w.items[w.items.length - 1]).toBe(19);
    expect(w.hiddenBelow).toBe(0);
    expect(w.hiddenAbove).toBe(13);
  });

  test("max <= 0 degrades to the full list", () => {
    const w = windowOptions(nums, 5, 0);
    expect(w.items).toEqual(nums);
    expect(w.hiddenAbove).toBe(0);
    expect(w.hiddenBelow).toBe(0);
  });
});

describe("resolveConflicts", () => {
  const map = (pairs: ReadonlyArray<readonly [string, readonly string[]]>): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const [k, vs] of pairs) m.set(k, new Set(vs));
    return m;
  };

  test("first-in-list wins when two conflicting values both appear", () => {
    const conflicts = map([
      ["medusa-vite", ["medusa-next"]],
      ["medusa-next", ["medusa-vite"]],
    ]);
    expect(resolveConflicts(["medusa-vite", "medusa-next"], conflicts)).toEqual(["medusa-vite"]);
    expect(resolveConflicts(["medusa-next", "medusa-vite"], conflicts)).toEqual(["medusa-next"]);
  });

  test("non-conflicting values pass through untouched", () => {
    const conflicts = map([["medusa-vite", ["medusa-next"]]]);
    expect(resolveConflicts(["medusa-vite", "backend", "frontend"], conflicts)).toEqual([
      "medusa-vite",
      "backend",
      "frontend",
    ]);
  });

  test("conflicts are evaluated against already-kept items only, not against dropped ones", () => {
    // a conflicts with b. b conflicts with a and c. c conflicts with b.
    // Iterating [a, b, c]: a is kept; b conflicts with kept a → dropped;
    // c is checked against the kept set {a}, which doesn't conflict with c,
    // so c is kept. The c-conflicts-with-b relation is moot because b never
    // made it into the kept set.
    const conflicts = map([
      ["a", ["b"]],
      ["b", ["a", "c"]],
      ["c", ["b"]],
    ]);
    expect(resolveConflicts(["a", "c"], conflicts)).toEqual(["a", "c"]);
    expect(resolveConflicts(["a", "b", "c"], conflicts)).toEqual(["a", "c"]);
  });

  test("empty input and empty map are safe", () => {
    expect(resolveConflicts([], new Map())).toEqual([]);
    expect(resolveConflicts(["a", "b"], new Map())).toEqual(["a", "b"]);
  });
});
