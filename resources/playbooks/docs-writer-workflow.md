# Playbook: Write a Documentation Deliverable (outline → cross-check → render)

Use when the user says "document this", "write the docs for X", "draft a guide /
reference / tutorial", or hands you a feature or diff that needs prose. Follow
the steps in order. A doc that skips the code cross-check ships confident lies.

## 1. Name the deliverable and its Diataxis mode (before any prose)

- Run `/goal` to restate the ask as one measurable target: which doc, for which
  reader, proving what.
- Pick exactly one Diataxis mode and say it out loud:
  - **Tutorial:** learning by doing, a guaranteed-to-work path.
  - **How-to:** a task recipe for someone who already knows the domain.
  - **Reference:** dry, complete, lookup-shaped (API, flags, schema).
  - **Explanation:** the why and the tradeoffs behind a design.
- When two modes fight for the same page, split them. Ask before merging.
- **Verify:** one sentence states the mode, the reader, and the done-check.

## 2. Ground the outline in the real code

- Run `meta/analyze` over the feature, module, or diff the doc describes. Read
  the 2-3 files that own the behavior, not the commit message about them.
- For an unfamiliar dependency, `tools/opensrc` fetches the real source so the
  outline cites implementations, not guesses.
- Draft the section skeleton in the Diataxis shape from step 1.
- **Verify:** every outline heading maps to a file, symbol, or flag you have read.

## 3. Draft from the outline

- Run `gstack/document-generate` (or `content/doc`) to expand the skeleton into
  prose, one section at a time.
- Keep code blocks runnable: paste the exact command or signature, not "you
  could try…". Pull diagrams from `design/tech-graph` when a flow needs a picture.
- **Verify:** every heading from step 2 has a body, and no `TODO` placeholder ships.

## 4. Cross-check the draft against the code and diff

- Run `gstack/document-release` to map the draft against what actually shipped
  and flag drift (renamed flags, dead steps, missing reference rows).
- Spot-check each command and code sample by running it; for browser-facing docs
  drive the page with `content/playwright` and confirm the screen matches the text.
- Run `/verify` on any claim a reader will act on (install steps, API contracts).
- **Verify:** zero commands that error, zero references to symbols that no longer exist.

## 5. Voice and clarity pass

- Run `ai-slop-detector` on the prose. Kill em dashes, the banned AI vocab list,
  and hollow hedging.
- Lead each section with the verb or the answer. Cut sentences that restate the
  heading. Read one paragraph aloud; if it stalls, shorten it.
- For an over-long page, `caveman/caveman-compress` tightens without losing facts.
- **Verify:** a fresh reader could follow the page cold, and the slop score is clean.

## 6. Render and hand off

- Render the format the reader needs: `gstack/make-pdf` or `content/pdf` for PDF,
  `content/preview` for an HTML walkthrough or slides, raw Markdown otherwise.
- Open the rendered artifact and read it. Broken tables, clipped diagrams, and
  bad page breaks only show up rendered.
- Commit with `/caveman-commit`; the body says what the doc now covers and what
  it omits.
- Get the artifact to its reader by the route that fits: push the Markdown so it
  renders in the repo, open a PR via `gstack/ship` for a reviewed doc, or
  distribute the rendered file (upload, share link, attach) when the reader lives
  outside the repo. Tell the user the exact path or URL.
- **Verify:** the rendered file opens clean, and the reader can reach it from the
  path, PR link, or share URL you handed them.

## When to use which review

| Doc covers… | Cross-check lever (step 4) |
|---|---|
| A shipped feature / merged diff | `gstack/document-release` + `/verify` on the steps |
| An API / CLI / schema reference | `meta/analyze` the source, then `/verify` each signature |
| A browser-facing tutorial | `content/playwright` walks the real flow |
| A code change in review | `/code-review` the diff so the doc and code land together |

**See also:** `playbooks/gstack-workflow.md` (ship and review the diff).

## Anti-patterns to avoid

- Writing prose before reading the code it describes. Step 2 is the cheap insurance.
- Mixing tutorial and reference on one page because both felt relevant.
- Shipping a command you never ran. "It should work" is how docs rot.
- Skipping the slop pass because the facts are right. Right and unreadable still fails.
- Calling it done on the Markdown without opening the rendered PDF or HTML.
