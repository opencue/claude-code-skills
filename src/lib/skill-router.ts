/**
 * Skill router — parses SKILL.md frontmatter into two complementary views
 * that get injected into the materialized CLAUDE.md persona block:
 *
 *   1. Capability router (proactive) — "when you're about to do X, reach for Y"
 *      Surfaced first because it's what Claude consults during its own
 *      reasoning, not just on user phrase matches.
 *
 *   2. Trigger router (reactive) — "user said X → jump to Y"
 *      Surfaced second for the explicit-request case.
 *
 *   3. Other skills (tail) — skills whose description didn't yield either,
 *      listed by name + raw description so they're still visible. These are
 *      the W6/W7 punch list for description cleanup.
 *
 * The parser is intentionally permissive: existing skills don't have new
 * frontmatter fields; we infer capability from prose. Skills that add
 * explicit `capability:` and `when_to_invoke:` fields get used verbatim.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

export type ParseQuality = "good" | "partial" | "none";

export interface ParsedSkill {
  /** Skill slug as it appears in profile.yaml (e.g. "higgsfield/higgsfield-generate"). */
  id: string;
  /** Display name from frontmatter `name:`, falling back to last slug segment. */
  name: string;
  /** User-phrase triggers, extracted from quoted strings in description. */
  triggers: string[];
  /** One-line capability summary — what the skill does, why not to freestyle. */
  capability: string;
  /** True if `capability:` was set explicitly in frontmatter (vs inferred from prose). */
  capabilityExplicit: boolean;
  /** Proactive task-shapes — when to invoke during Claude's own work. */
  whenToInvoke: string[];
  /** Anti-scope ("NOT for ...") — kept for tooltips and disambiguation. */
  notFor: string;
  /** Raw description text, unmodified. */
  rawDescription: string;
  /** Heuristic grade — drives W6/W7/W8 linter rules. */
  quality: ParseQuality;
  /** True if the SKILL.md file couldn't be located on disk. */
  missing: boolean;
}

interface Frontmatter {
  name?: unknown;
  description?: unknown;
  capability?: unknown;
  when_to_invoke?: unknown;
}

// ---------------------------------------------------------------------------
// Frontmatter extraction
// ---------------------------------------------------------------------------

function extractFrontmatter(content: string): Frontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]!) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Frontmatter)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  }
  const s = asString(value);
  if (!s) return [];
  // Allow newline-separated bullets in a single string field
  return s.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Description parsing — the heuristic core
// ---------------------------------------------------------------------------

/**
 * Pull quoted phrases out of strings like:
 *   Use when user says "X", "Y", or "Z". Capability prose. NOT for foo.
 *
 * Matches both straight and curly quotes; tolerant of "user asks for",
 * "user wants to", "user mentions", "user says for", "the user X".
 */
const QUOTED_RE = /["“]([^"”]+?)["”]/g;
const TRIGGER_PREFIX_RE = /\buse\s+when\s+(?:the\s+)?(?:user|caller|operator)\s+(?:says?|asks?(?:\s+for)?|wants?(?:\s+to)?|mentions?|requests?|needs?)\b/i;
const NOT_FOR_RE = /\b(?:NOT|don['’]t use|never use)\s+for\b[^.]*\./i;

function parseDescription(description: string): {
  triggers: string[];
  capability: string;
  notFor: string;
} {
  if (!description) return { triggers: [], capability: "", notFor: "" };

  // Find the trigger sentence (if any) — the prefix "Use when user says ..."
  // and the chunk of text up to the next sentence break.
  const triggerStart = description.search(TRIGGER_PREFIX_RE);
  const triggers: string[] = [];

  if (triggerStart >= 0) {
    // Collect all quoted phrases inside the trigger sentence.
    const triggerSentenceEnd = (() => {
      const after = description.slice(triggerStart);
      const period = after.search(/\.\s|$/);
      return period >= 0 ? triggerStart + period + 1 : description.length;
    })();
    const triggerSentence = description.slice(triggerStart, triggerSentenceEnd);
    for (const m of triggerSentence.matchAll(QUOTED_RE)) {
      const phrase = m[1]!.trim();
      if (phrase.length > 0 && phrase.length <= 80) triggers.push(phrase);
    }
  }

  // Anti-scope: "NOT for ..." sentence anywhere in the description.
  const notForMatch = description.match(NOT_FOR_RE);
  const notFor = notForMatch ? notForMatch[0].trim() : "";

  // Capability prose: take the description, strip the trigger sentence + notFor,
  // and what's left is the capability summary.
  let capability = description;
  if (triggerStart >= 0) {
    const after = description.slice(triggerStart);
    const period = after.search(/\.\s|$/);
    const end = period >= 0 ? triggerStart + period + 1 : description.length;
    capability = (description.slice(0, triggerStart) + " " + description.slice(end)).trim();
  }
  if (notFor) capability = capability.replace(notFor, "").trim();
  capability = capability.replace(/\s+/g, " ").trim();
  // Strip a trailing orphan "Use when..." that lacked quotes
  capability = capability.replace(/^[.\s]+|[.\s]+$/g, "");

  return { triggers, capability, notFor };
}

function gradeQuality(p: {
  triggers: string[];
  capability: string;
  whenToInvoke: string[];
}): ParseQuality {
  const hasTriggers = p.triggers.length > 0;
  const hasCapability = p.capability.length >= 20; // arbitrary "more than a fragment"
  const hasWhenTo = p.whenToInvoke.length > 0;
  if (hasTriggers && (hasCapability || hasWhenTo)) return "good";
  if (hasTriggers || hasCapability || hasWhenTo) return "partial";
  return "none";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a skill from a SKILL.md file living under `<skillsRoot>/<id>/SKILL.md`.
 * Missing files yield a `missing: true` record with quality `none` — used for
 * npx/plugin skills that don't have a local on-disk copy.
 */
export async function parseSkillFromPath(
  skillId: string,
  skillsRoot: string,
): Promise<ParsedSkill> {
  const slugParts = skillId.split("/");
  const path = join(skillsRoot, ...slugParts, "SKILL.md");
  return parseSkillFromFile(skillId, path);
}

/**
 * Parse a skill from a directory containing SKILL.md. Use when the caller has
 * already resolved the skill's source dir (e.g. via `skillSourceLookup` in
 * the materializer, which handles local + npx + plugin resolution).
 */
export async function parseSkillFromDir(
  skillId: string,
  dir: string,
): Promise<ParsedSkill> {
  return parseSkillFromFile(skillId, join(dir, "SKILL.md"));
}

async function parseSkillFromFile(skillId: string, path: string): Promise<ParsedSkill> {
  const slugParts = skillId.split("/");
  const fallbackName = slugParts[slugParts.length - 1]!;

  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return {
      id: skillId,
      name: fallbackName,
      triggers: [],
      capability: "",
      capabilityExplicit: false,
      whenToInvoke: [],
      notFor: "",
      rawDescription: "",
      quality: "none",
      missing: true,
    };
  }

  return parseSkillFromContent(skillId, content, fallbackName);
}

/** Pure variant — for tests and in-memory callers. */
export function parseSkillFromContent(
  skillId: string,
  content: string,
  fallbackName?: string,
): ParsedSkill {
  const slugParts = skillId.split("/");
  const name = fallbackName ?? slugParts[slugParts.length - 1]!;
  const fm = extractFrontmatter(content);
  if (!fm) {
    return {
      id: skillId,
      name,
      triggers: [],
      capability: "",
      capabilityExplicit: false,
      whenToInvoke: [],
      notFor: "",
      rawDescription: "",
      quality: "none",
      missing: false,
    };
  }

  const fmName = asString(fm.name) || name;
  const description = asString(fm.description);
  const explicitCapability = asString(fm.capability);
  const explicitWhenTo = asStringList(fm.when_to_invoke);
  const explicitTriggers = asStringList(fm.triggers);

  const parsed = parseDescription(description);
  const capability = explicitCapability || parsed.capability;
  const whenToInvoke = explicitWhenTo;
  // Combine explicit frontmatter triggers with phrases parsed out of the
  // description prose. Explicit entries win on ordering; duplicates collapse
  // case-insensitively. This lets authors list triggers cleanly in
  // frontmatter without abandoning the description-as-prose discovery path.
  const seen = new Set<string>();
  const triggers: string[] = [];
  for (const t of [...explicitTriggers, ...parsed.triggers]) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    triggers.push(trimmed);
  }
  const quality = gradeQuality({ triggers, capability, whenToInvoke });

  return {
    id: skillId,
    name: fmName,
    triggers,
    capability,
    capabilityExplicit: explicitCapability.length > 0,
    whenToInvoke,
    notFor: parsed.notFor,
    rawDescription: description,
    quality,
    missing: false,
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export interface RouterRenderOptions {
  /** Heading prefix used for sub-sections (default "##"). */
  headingLevel?: string;
  /** Cap triggers per skill in the trigger table — keeps the table scannable. */
  maxTriggersPerSkill?: number;
  /** Hand-tuned override entries from `persona_routing:` in profile.yaml. */
  overrides?: RouterOverride[];
}

/**
 * Hand-tuned router entry from `persona_routing:`. Mirrors the schema's
 * PersonaRoutingEntry. Merged into the auto-built tables with a clear
 * visual marker so it's obvious which rows are author-edited.
 */
export interface RouterOverride {
  phrase?: string;
  capability?: string;
  skill: string;
  note?: string;
}

/**
 * Render the two-section router (capability + trigger) plus an "Other skills"
 * tail. Returns an empty string if there's nothing meaningful to render
 * (e.g. all skills are missing on disk and have no metadata).
 */
export function renderRouter(
  skills: ParsedSkill[],
  options: RouterRenderOptions = {},
): string {
  const heading = options.headingLevel ?? "##";
  const maxTriggers = options.maxTriggersPerSkill ?? 6;
  const overrides = options.overrides ?? [];

  // Capability rows: any skill with a capability blurb OR explicit
  // when_to_invoke entries. We surface up to 3 task-shapes per skill;
  // skills with only a capability blurb render a single "any X work" row.
  const capabilityRows: { task: string; skill: string; manual?: boolean; note?: string }[] = [];
  for (const s of skills) {
    if (s.whenToInvoke.length > 0) {
      for (const task of s.whenToInvoke.slice(0, 3)) {
        capabilityRows.push({ task, skill: s.name });
      }
    } else if (s.capability) {
      const summary = truncate(s.capability, 70);
      capabilityRows.push({ task: summary, skill: s.name });
    }
  }

  // Trigger rows: every quoted phrase, capped per skill.
  const triggerRows: { phrase: string; skill: string; manual?: boolean; note?: string }[] = [];
  for (const s of skills) {
    for (const phrase of s.triggers.slice(0, maxTriggers)) {
      triggerRows.push({ phrase: `"${phrase}"`, skill: s.name });
    }
  }

  // Merge in `persona_routing:` overrides. Manual rows render with a marker
  // so it's visible which rows are author-edited.
  for (const ovr of overrides) {
    if (ovr.capability) {
      capabilityRows.push({
        task: ovr.capability,
        skill: ovr.skill,
        manual: true,
        note: ovr.note,
      });
    }
    if (ovr.phrase) {
      triggerRows.push({
        phrase: `"${ovr.phrase}"`,
        skill: ovr.skill,
        manual: true,
        note: ovr.note,
      });
    }
  }

  // Tail: skills that yielded nothing or are missing on disk.
  const otherSkills = skills.filter((s) => s.quality === "none");

  if (capabilityRows.length === 0 && triggerRows.length === 0 && otherSkills.length === 0) {
    return "";
  }

  let out = "";

  const marker = (manual?: boolean) => (manual ? " ✎" : "");
  const noteCell = (note?: string) => (note ? ` — ${escapeCell(note)}` : "");

  if (capabilityRows.length > 0) {
    out += `${heading} Skill capabilities (USE THESE — don't freestyle)\n\n`;
    out += "| When you're about to… | Reach for |\n";
    out += "|---|---|\n";
    for (const row of capabilityRows) {
      out += `| ${escapeCell(row.task)}${marker(row.manual)}${noteCell(row.note)} | \`${escapeCell(row.skill)}\` |\n`;
    }
    out += "\n";
    out +=
      "These wrap the underlying tools with prompt-enhancement, house " +
      "style, or correct CLI invocations. Freestyling around them produces " +
      "worse output.\n\n";
  }

  if (triggerRows.length > 0) {
    out += `${heading} Trigger phrases (when user says these, jump straight to the skill)\n\n`;
    out += "| Phrase | Skill |\n";
    out += "|---|---|\n";
    for (const row of triggerRows) {
      out += `| ${escapeCell(row.phrase)}${marker(row.manual)}${noteCell(row.note)} | \`${escapeCell(row.skill)}\` |\n`;
    }
    out += "\n";
  }

  if (overrides.length > 0) {
    out += `${heading === "##" ? "###" : heading} ✎ = manual entry from \`persona_routing:\` in profile.yaml\n\n`;
  }

  if (otherSkills.length > 0) {
    out += `${heading} Other skills\n\n`;
    out +=
      "These have weak metadata — Claude won't auto-route to them. " +
      "Invoke explicitly when needed.\n\n";
    for (const s of otherSkills) {
      const desc = s.rawDescription
        ? ` — ${truncate(s.rawDescription, 100)}`
        : s.missing
          ? " — (no local SKILL.md)"
          : "";
      out += `- \`${s.id}\`${desc}\n`;
    }
    out += "\n";
  }

  return out;
}
