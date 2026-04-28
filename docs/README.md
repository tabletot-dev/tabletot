# tabletot-pilot — docs

Project documentation, ADRs, and working notes. Lives inside the repo so
it travels with the code and is reachable by Claude Code.

## What's here

- **`overview.md`** — current state of the project. Start here.
- **`decisions/`** — Architecture Decision Records. Numbered, immutable.
  Read any that touch the area you're working in.
- **`notes/`** — working notes, brainstorms, learnings, half-thoughts.
  Flat folder, no structure. Promotes to a real folder if a pattern emerges.

## How to use this vault

If you have Obsidian: open this `docs/` folder as a vault.
If you don't: it's just markdown. Any editor works.

Conventions:
- Cross-reference notes with wikilinks: `[[0001-monorepo]]` not full paths.
- Tags inline as `#open-question`, `#superseded`, `#deferred`.
- Frontmatter (YAML at top) on ADRs; optional everywhere else.

## Writing a new ADR

1. Copy `decisions/_template.md` to `decisions/NNNN-short-name.md`
   (next number, kebab-case name).
2. Fill in all four sections. Keep it under one page.
3. Commit with the code change it justifies, or as its own commit if
   the decision precedes the code.
4. Never edit an ADR after committing. To change a decision, write a new
   ADR and update the old one's frontmatter to `status: superseded by NNNN`.
