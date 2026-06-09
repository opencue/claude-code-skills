"""Find, load, and reassemble cue SKILL.md files.

Adapted from hermes' skill_module.{load_skill,find_skill,reassemble_skill}.
cue skills live at:  <skills_root>/<category>/<slug>/SKILL.md
and carry a `name:` field in YAML frontmatter (the canonical id used by the npx
registry — see the cue memory "npx skill IDs = name: field").

No DSPy import here, so this module is usable in the offline / dry-run path.
"""

from pathlib import Path
from typing import Optional


def load_skill(skill_path: Path) -> dict:
    """Load a SKILL.md and split frontmatter / body.

    Returns dict with: path, raw, frontmatter, body, name, description.
    """
    raw = skill_path.read_text()

    frontmatter = ""
    body = raw
    if raw.lstrip().startswith("---"):
        # Split on the first two "---" fences only.
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            frontmatter = parts[1].strip()
            body = parts[2].strip()

    name = ""
    description = ""
    for line in frontmatter.split("\n"):
        stripped = line.strip()
        if stripped.startswith("name:"):
            name = stripped.split(":", 1)[1].strip().strip("'\"")
        elif stripped.startswith("description:"):
            description = stripped.split(":", 1)[1].strip().strip("'\"")

    return {
        "path": skill_path,
        "raw": raw,
        "frontmatter": frontmatter,
        "body": body,
        "name": name,
        "description": description,
    }


def find_skill(skill_id: str, skills_root: Path) -> Optional[Path]:
    """Locate a cue skill's SKILL.md.

    Accepts any of:
      * "category/slug"           e.g. "eu-funding/ted-tender-search"
      * "slug"                    e.g. "ted-tender-search"  (dir name)
      * a frontmatter name:       (matched as a fallback)
    """
    if not skills_root.exists():
        return None

    skill_id = skill_id.strip().strip("/")

    # 1. Exact relative path "category/slug/SKILL.md".
    #    Resolve and confirm it stays inside skills_root (no ../ traversal).
    direct = (skills_root / skill_id / "SKILL.md").resolve()
    root = skills_root.resolve()
    if direct.is_file() and str(direct).startswith(str(root) + "/"):
        return direct

    slug = skill_id.split("/")[-1]

    # 2. Directory name match anywhere in the tree.
    for skill_md in skills_root.rglob("SKILL.md"):
        if skill_md.parent.name == slug:
            return skill_md

    # 3. Frontmatter `name:` match (handles short/renamed slugs).
    for skill_md in skills_root.rglob("SKILL.md"):
        try:
            head = skill_md.read_text()[:600]
        except OSError:
            continue
        if f"name: {slug}" in head or f'name: "{slug}"' in head or f"name: '{slug}'" in head:
            return skill_md

    return None


def reassemble_skill(frontmatter: str, evolved_body: str) -> str:
    """Rebuild a SKILL.md, preserving the original frontmatter verbatim.

    Only the body is replaced — `name`, `description`, `tags`, etc. are
    immutable so the skill's identity and registry id never drift.
    """
    return f"---\n{frontmatter}\n---\n\n{evolved_body}\n"
