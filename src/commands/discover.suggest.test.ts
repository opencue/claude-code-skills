/**
 * Regression tests for suggestProfiles — the profile mapper that decides which
 * cue profile pages a discovered skill lands on.
 *
 * Locks in known-bad mismaps:
 *   - korean-privacy-terms landed in frontend/nextjs (single `nextjs` tag)
 *   - russian-text-quality landed in frontend (single `vue-i18n` tag)
 *   - bbc-skill (Bilibili scraper) landed in frontend (incidental css+tailwind)
 *   - fs25-claude-skill (Farming Simulator) landed in core only — kept that way
 *
 * Real positives must continue to map correctly.
 */

import { describe, expect, test } from "bun:test";
import { suggestProfiles, hasNicheTopicSignal, type GemRepo } from "./discover";

function gem(partial: Partial<GemRepo>): GemRepo {
  return {
    full_name: "",
    owner: "",
    name: "",
    description: "",
    stars: 0,
    forks: 0,
    created_at: new Date().toISOString(),
    pushed_at: new Date().toISOString(),
    topics: [],
    language: "",
    has_skill_md: false,
    has_claude_dir: false,
    has_mcp_sdk: false,
    gem_score: 0,
    suggested_profiles: [],
    suggested_mcps: [],
    suggested_clis: [],
    quality: 0,
    url: "",
    ...partial,
  };
}

describe("suggestProfiles — niche-subject veto for stack profiles", () => {
  test("korean-privacy-terms (legal-tech via Next.js) does NOT land in frontend/nextjs", () => {
    const r = gem({
      name: "korean-privacy-terms",
      description: "Generate compliant Korean privacy policies and terms of service automatically using local laws and updated Claude Code skills.",
      topics: ["agent-skills", "claude-code", "claude-skill", "korean-law", "legal-tech", "mdx", "nextjs", "privacy-policy", "shadcn-ui", "terms-of-service"],
      language: "Go Template",
    });
    const out = suggestProfiles(r);
    expect(out).not.toContain("frontend");
    expect(out).not.toContain("nextjs");
  });

  test("russian-text-quality (i18n linter) does NOT land in frontend via vue-i18n tag", () => {
    const r = gem({
      name: "russian-text-quality",
      description: "Analyze Russian text quality using automated checks for i18n, plural rules, and CLDR standards to ensure linguistic accuracy.",
      topics: ["agent-skills", "ai-agents", "claude-skill", "cldr", "codex-cli", "content-design", "cursor", "editorial", "i18n", "icu-messageformat", "info-style", "linter", "localization", "notion", "openclaw", "russian", "russian-language", "ux-writing", "vue-i18n"],
    });
    expect(suggestProfiles(r)).not.toContain("frontend");
  });

  test("bbc-skill (Bilibili scraper) does NOT land in frontend via incidental css/tailwind tags", () => {
    const r = gem({
      name: "bbc-skill",
      description: "Fetch Bilibili comments and video metadata for AI agent analysis using a zero-dependency CLI tool.",
      topics: ["automation", "backend", "basic", "bbc", "bilibili-api", "claude-code-skill", "css", "daisyui", "documentation", "machine-learning", "openclaw", "tailwind", "web-scraping"],
      language: "Python",
    });
    expect(suggestProfiles(r)).not.toContain("frontend");
  });

  test("Farming Simulator skill stays in core, not frontend/backend/python-api", () => {
    const r = gem({
      name: "fs25-claude-skill",
      description: "Automate Farming Simulator 25 mod development using a Claude skill trained on game APIs and common coding patterns.",
      topics: ["anthropic", "claude-ai", "claude-skill", "farming-simulator", "farming-simulator-25"],
      language: "Lua",
    });
    const out = suggestProfiles(r);
    expect(out).toEqual(["core"]);
  });
});

describe("suggestProfiles — real positives keep working", () => {
  test("a genuine pentest/recon skill still maps to cybersecurity", () => {
    const r = gem({
      name: "Claude-OSINT",
      description: "Claude skills for external recon, dorks, credential validators, and red-team tradecraft for authorized engagements.",
      topics: ["recon", "osint", "pentest", "red-team", "claude-skill"],
      language: "Python",
    });
    expect(suggestProfiles(r)).toContain("cybersecurity");
  });

  test("a Next.js skill with Next.js-focused description still maps to nextjs", () => {
    const r = gem({
      name: "next-auth-helpers",
      description: "Next.js App Router helpers for next-auth with server components and Vercel deploy presets.",
      topics: ["nextjs", "next.js", "vercel", "next-auth", "app-router", "server-component"],
      language: "TypeScript",
    });
    expect(suggestProfiles(r)).toContain("nextjs");
  });

  test("a real cybersecurity audit skill is not blocked by single-tag rule", () => {
    const r = gem({
      name: "vuln-scanner",
      description: "Automated vulnerability scanner with CVE lookup and OWASP top-10 checks.",
      topics: ["security", "vulnerability", "cve", "owasp"],
      language: "Go",
    });
    expect(suggestProfiles(r)).toContain("cybersecurity");
  });

  test("single-tag matches no longer auto-assign — distinct≥2 enforced", () => {
    const r = gem({
      name: "some-skill",
      description: "Does a thing.",
      topics: ["nextjs"], // single keyword, single distinct hit
    });
    const out = suggestProfiles(r);
    expect(out).toEqual(["core"]);
  });
});

// ---------------------------------------------------------------------------
// Niche / regional-vertical routing
//
// Locks in the fix from the user's complaint: high-star Chinese/Korean
// regional/vertical skills crowded out fleet/MCP gems on the core profile
// page. These cases now route to a dedicated `niche` bucket.
// ---------------------------------------------------------------------------

describe("hasNicheTopicSignal — regional/vertical detector", () => {
  test("BOSS 直聘 (Chinese job CLI) is niche", () => {
    const r = gem({
      name: "boss-agent-cli",
      description: "AI-agent-first CLI for BOSS 直聘 — 职位搜索、福利筛选、招聘者工作流、MCP 工具与 AI 简历优化",
      stars: 905,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("倪海厦中医 (TCM teacher) is niche", () => {
    const r = gem({
      name: "nihaixia",
      description: "倪海厦视角的中医Agent Skill，基于倪海厦教学资料开发，蒸馏倪师伤寒论、金匮要略、黄帝内经、神农本草经、针灸篇",
      stars: 28,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("造价大师 (China construction costing) is niche", () => {
    const r = gem({
      name: "costing-master",
      description: "造价大师 — 中国建设工程造价管理全流程AI助手。遵循GB/T 50500-2024，覆盖投资估算到竣工决算，兼容各省定额与广联达。",
      stars: 1,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("dating-coach (恋爱聊天教练) is niche", () => {
    const r = gem({
      name: "devil-chat-coach",
      description: "🧠 AI Agent Skill: 实战恋爱聊天教练，贴对方消息按「阶段+温度」给你能用的回复 | AI agent skill for dating chat coach",
      stars: 0,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("Bible study toolkit is niche", () => {
    const r = gem({
      name: "godstruegospel",
      description: "A concordant Bible-study toolkit grounded in Hebrew, Aramaic and Greek with true-gospel emphasis.",
      stars: 0,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("xiaozhi-esp32-server is niche", () => {
    const r = gem({
      name: "xiaozhi-esp32-server",
      description: "本项目为xiaozhi-esp32提供后端服务，帮助您快速搭建ESP32设备控制服务器。Backend service for xiaozhi",
      stars: 9626,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("Korean-privacy-terms is niche", () => {
    const r = gem({
      name: "korean-privacy-terms",
      description: "Generate compliant Korean privacy policies and terms of service automatically.",
      stars: 4,
    });
    expect(hasNicheTopicSignal(r)).toBe(true);
  });

  test("Sub2API (Chinese desc, generic AI router) is NOT niche", () => {
    // CJK-heavy but mentions Claude/OpenAI/Gemini — generic tool, keep findable.
    const r = gem({
      name: "sub2api",
      description: "Sub2API 一站式开源中转服务，让 Claude、Openai 、Gemini、Antigravity订阅统一接入，支持拼车共享",
      stars: 23552,
    });
    expect(hasNicheTopicSignal(r)).toBe(false);
  });

  test("oh-my-agent (English, generic harness) is NOT niche", () => {
    const r = gem({
      name: "oh-my-agent",
      description: "Portable, vendor-agnostic agent harness for project-specific skills, workflows, and rules.",
      stars: 1020,
    });
    expect(hasNicheTopicSignal(r)).toBe(false);
  });

  test("entroly (English, context compression) is NOT niche", () => {
    const r = gem({
      name: "entroly",
      description: "Entroly compresses AI context, detects hallucinations, and saves up to 80% tokens.",
      stars: 398,
    });
    expect(hasNicheTopicSignal(r)).toBe(false);
  });
});

describe("suggestProfiles — niche bucket routing", () => {
  test("BOSS 直聘 routes to niche, not core", () => {
    const r = gem({
      name: "boss-agent-cli",
      description: "AI-agent-first CLI for BOSS 直聘 — 职位搜索、福利筛选、招聘者工作流",
      topics: ["claude-skill"],
      stars: 905,
    });
    const out = suggestProfiles(r);
    expect(out).toEqual(["niche"]);
    expect(out).not.toContain("core");
  });

  test("造价大师 routes to niche, not core", () => {
    const r = gem({
      name: "costing-master",
      description: "造价大师 — 中国建设工程造价管理全流程AI助手。GB/T 50500",
      topics: ["claude-skill"],
      stars: 1,
    });
    expect(suggestProfiles(r)).toEqual(["niche"]);
  });

  test("xiaozhi-esp32 routes to niche even though backend keyword tags hit", () => {
    const r = gem({
      name: "xiaozhi-esp32-server",
      description: "本项目为xiaozhi-esp32提供后端服务 - Backend service for ESP32",
      topics: ["backend", "server"],
      stars: 9626,
    });
    const out = suggestProfiles(r);
    expect(out).not.toContain("backend");
    expect(out).toContain("niche");
  });

  test("real fleet-control skill is not collateral damage", () => {
    const r = gem({
      name: "oh-my-agent",
      description: "Portable, vendor-agnostic agent harness for project-specific skills, workflows, and rules. Multi-agent orchestration across Claude Code, Codex, Cursor.",
      topics: ["multi-agent", "orchestrator", "claude-skill"],
      stars: 1020,
    });
    expect(suggestProfiles(r)).toContain("fleet-control");
  });
});
