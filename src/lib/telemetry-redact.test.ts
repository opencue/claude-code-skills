import { describe, expect, test } from "bun:test";
import { redactPrompt, TELEMETRY_REDACTION_MAX_LENGTH } from "./telemetry-redact";

describe("redactPrompt", () => {
  test("masks Anthropic sk-ant keys", () => {
    const out = redactPrompt("my key is sk-ant-abc123def456ghi789jkl012mno345");
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("sk-ant-abc");
  });

  test("masks GitHub pat tokens", () => {
    const out = redactPrompt("auth ghp_AAAA1111BBBB2222CCCC3333DDDD4444EEEE");
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("ghp_AAAA");
  });

  test("masks AWS access keys", () => {
    const out = redactPrompt("AKIAIOSFODNN7EXAMPLE is in my env");
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("AKIAIOSFOD");
  });

  test("masks JWT-shaped bearer tokens", () => {
    const out = redactPrompt("token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("eyJhbGci");
  });

  test("masks long hex tokens", () => {
    const out = redactPrompt("hash 0123456789abcdef0123456789abcdef please");
    expect(out).toContain("<redacted>");
  });

  test("truncates to 80 chars", () => {
    // Use mixed-case prose so it doesn't match the long-hex secret pattern
    // (lowercase hex would otherwise be redacted before truncation).
    const long = "How do I rename the user table? ".repeat(20);
    const out = redactPrompt(long);
    expect(out.length).toBeLessThanOrEqual(TELEMETRY_REDACTION_MAX_LENGTH);
    expect(out.endsWith("…")).toBe(true);
  });

  test("collapses whitespace", () => {
    const out = redactPrompt("save\n\n  progress    now");
    expect(out).toBe("save progress now");
  });

  test("is idempotent (running twice = once)", () => {
    const input = "sk-ant-abc123def456ghi789jkl012mno345 do thing";
    const once = redactPrompt(input);
    const twice = redactPrompt(once);
    expect(twice).toBe(once);
  });

  test("clean prompt passes through unchanged (modulo whitespace)", () => {
    const out = redactPrompt("save progress here");
    expect(out).toBe("save progress here");
  });
});
