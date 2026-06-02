import { describe, expect, test } from "bun:test";

import { recordCombo, type ComboRecord } from "./combo-history";

describe("recordCombo", () => {
  const capture = () => {
    const lines: string[] = [];
    return { lines, append: (l: string) => lines.push(l) };
  };

  test("writes a {ts, profile, primary} row for a real combo (≥2 parts)", () => {
    const { lines, append } = capture();
    const wrote = recordCombo(["gstack", "skill-writer", "core"], "2026-06-02T00:00:00.000Z", append);
    expect(wrote).toBe(true);
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!) as ComboRecord;
    expect(rec.profile).toBe("gstack+skill-writer+core");
    expect(rec.primary).toBe("gstack");
    expect(rec.ts).toBe("2026-06-02T00:00:00.000Z");
    expect(lines[0]!.endsWith("\n")).toBe(true);
  });

  test("a single-profile pick is not a combo → no write", () => {
    const { lines, append } = capture();
    expect(recordCombo(["gstack"], "t", append)).toBe(false);
    expect(lines).toHaveLength(0);
  });

  test("dedupes parts before recording (so a+a+b → a+b)", () => {
    const { lines, append } = capture();
    recordCombo(["a", "a", "b"], "t", append);
    expect((JSON.parse(lines[0]!) as ComboRecord).profile).toBe("a+b");
  });

  test("dedup that collapses to a single distinct part is not recorded", () => {
    const { lines, append } = capture();
    expect(recordCombo(["a", "a"], "t", append)).toBe(false);
    expect(lines).toHaveLength(0);
  });

  test("trims whitespace and drops empty parts", () => {
    const { lines, append } = capture();
    recordCombo([" a ", "", " b "], "t", append);
    expect((JSON.parse(lines[0]!) as ComboRecord).profile).toBe("a+b");
  });

  test("a throwing append is swallowed (best-effort) → returns false", () => {
    const wrote = recordCombo(["a", "b"], "t", () => {
      throw new Error("disk full");
    });
    expect(wrote).toBe(false);
  });
});
