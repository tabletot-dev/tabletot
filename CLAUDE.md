# Working in tabletot-pilot

This repo is a tablet-based ordering + recommendation system for Indian dine-in
restaurants. Pilot 1: Roast CCx, Hyderabad. Solo developer (Rohan).

## Read these before making changes

1. `docs/overview.md` — current state of the project, what's in scope right now.
2. `docs/decisions/` — list filenames; read any ADR relevant to what you're
   about to touch. ADRs are numbered and named by topic.

## When you make a meaningful decision

- **Architectural?** Propose a new ADR using `docs/decisions/_template.md`.
  Never edit existing ADRs. To replace one, write a new ADR and mark the
  old one as superseded in its frontmatter.
- **Smaller?** Add a note to `docs/notes/`, or update `docs/overview.md` if
  the project state has changed.

## When uncertain

- Ask. Don't guess about architecture, naming conventions, or where files
  should live. Cheap to ask, expensive to undo.

## Repo layout (high-level)

- `apps/` — user-facing surfaces (kiosk, pos, voice-test-page).
- `services/` — backend processes (order-engine: resolver + LLM + voice).
- `packages/` — shared code (types, utilities) — empty for now.
- `supabase/` — migrations, edge functions, seed data.
- `docs/` — this vault. Open as an Obsidian vault if you use Obsidian.
