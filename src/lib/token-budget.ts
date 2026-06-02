/**
 * Token-budget accounting for materialized profiles — pure, filesystem-free.
 *
 * Extracted from commands/launch.ts (which re-exports these for back-compat).
 * The *formatting* of the budget (colors, the CLI banner block) stays in
 * launch.ts; this module is just the measurement math, so it's unit-testable
 * in isolation and reusable by other surfaces (status, doctor, dashboard).
 */

import type { ResolvedProfile } from "../../profiles/_types";

export interface SkillTokens {
  /** Tokens for the YAML frontmatter (always-on, loaded into skill router). */
  frontmatter: number;
  /** Tokens for the rest of SKILL.md (load-on-activate). */
  body: number;
}

export interface TokenBreakdown {
  /** Sum of frontmatter tokens across every skill — the real always-on cost. */
  alwaysOn: number;
  /** Sum of body tokens — the ceiling if every skill activates this session. */
  maxIfAllActivate: number;
  /** Skill count for the header line. */
  totalSkills: number;
  /**
   * Per-profile attribution of `alwaysOn` for composite selectors (length > 1).
   * Each skill is credited to the first part that declares it, so per-part
   * numbers sum to `alwaysOn` (no double-counting from overlap). Empty for
   * single-part profiles. `icon` carries the part's emoji when declared.
   */
  byProfile: { name: string; icon?: string; tokens: number; skillCount: number }[];
  /** Skills sorted by body size, descending — for the "heaviest if activated" hint. */
  heaviestBodies: { id: string; tokens: number }[];
}

export function computeTokenBreakdown(
  profile: ResolvedProfile,
  parts: ResolvedProfile[] | undefined,
  tokensForSkill: (id: string) => SkillTokens,
): TokenBreakdown {
  let alwaysOn = 0;
  let maxIfAllActivate = 0;
  const heaviestBodies: { id: string; tokens: number }[] = [];
  for (const s of profile.skills.local) {
    const { frontmatter, body } = tokensForSkill(s.id);
    alwaysOn += frontmatter;
    maxIfAllActivate += body;
    if (body > 0) heaviestBodies.push({ id: s.id, tokens: body });
  }
  heaviestBodies.sort((a, b) => b.tokens - a.tokens);

  const byProfile: TokenBreakdown["byProfile"] = [];
  if (parts && parts.length > 1) {
    const credited = new Set<string>();
    for (const part of parts) {
      let pTokens = 0;
      let pCount = 0;
      for (const s of part.skills.local) {
        if (credited.has(s.id)) continue;
        credited.add(s.id);
        const { frontmatter } = tokensForSkill(s.id);
        if (frontmatter > 0) {
          pTokens += frontmatter;
          pCount += 1;
        }
      }
      byProfile.push({ name: part.name, icon: part.icon, tokens: pTokens, skillCount: pCount });
    }
  }

  return {
    alwaysOn,
    maxIfAllActivate,
    totalSkills: profile.skills.local.length,
    byProfile,
    heaviestBodies,
  };
}

/**
 * Extract frontmatter byte length from a SKILL.md string. Returns
 * `{ frontmatter, body }` byte counts. Falls back to a token count of zero
 * when the file lacks the leading `---` block (still legal but rare).
 */
export function splitSkillBytes(source: string): { frontmatter: number; body: number } {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { frontmatter: 0, body: source.length };
  }
  // Find the closing `---` on its own line. Search starts after the opener.
  const closer = source.indexOf("\n---", 4);
  if (closer === -1) {
    return { frontmatter: source.length, body: 0 };
  }
  // Include the closing `---\n` in the frontmatter block.
  const fmEnd = source.indexOf("\n", closer + 1);
  const cut = fmEnd === -1 ? source.length : fmEnd + 1;
  return { frontmatter: cut, body: source.length - cut };
}

/**
 * Map an always-on token count to the bands we color in the CLI banner and
 * the tmux pane-border badge. Single source of truth so the two displays
 * never drift apart on threshold values.
 */
export function tokenLevelEmoji(alwaysOn: number): "🔴" | "🟠" | "🟡" | "🟢" {
  return alwaysOn > 15000 ? "🔴"
    : alwaysOn > 10000 ? "🟠"
      : alwaysOn > 5000 ? "🟡"
        : "🟢";
}
