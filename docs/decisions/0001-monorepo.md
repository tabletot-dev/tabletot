---
status: accepted
date: 2026-04-28
tags: [structure, repo-layout]
---

# 0001 — We use a single monorepo for tabletot-pilot

## Context

The pilot consists of multiple distinct surfaces and services that all need
to ship together for Roast CCx, Hyderabad:

- A customer-facing tablet PWA (TypeScript/React/Vite) — evolved from the
  tabletot frontend PoC.
- A POS/admin/kitchen UI (TypeScript/React/Vite + Supabase) — the tabletot
  POS PoC.
- An order engine (Python/FastAPI) — menu resolver, LLM intent extraction,
  voice pipeline.
- A voice-test-page (TypeScript/React) kept as regression reference.
- Shared Supabase schema, migrations, and seed data.

All of these change together during the pilot. A schema change touches
migrations + POS + kiosk + order-engine simultaneously. A new menu item
shape touches the resolver, the kiosk's order shape, and the POS's
admin UI. The development is solo (one developer) and is expected to
remain solo through pilot 1.

The two prior projects (tabletot frontend and tabletot POS) lived in
separate repositories as Lovable-generated PoCs. They communicated via
Google Sheets as middleware — an architecture that is being retired
([[0003-kill-google-sheets-middleware]] when written).

## Decision

We use a single git repository (tabletot-pilot) containing all
apps, services, packages, and Supabase configuration. Frontend code is
TypeScript; backend services may be in any language; folders, not
package boundaries, separate them.


> Write it in your own voice — the way you'd describe the decision to a
new collaborator on day one. Keep it under 50 words.


The repo layout is:

```
tabletot-pilot/
├── apps/                  # user-facing surfaces
│   ├── kiosk/             # customer PWA (was tabletot frontend)
│   ├── pos/               # operator UI (was tabletot POS)
│   └── voice-test-page/   # regression reference
├── services/
│   └── order-engine/      # resolver + LLM + voice (Python)
├── packages/              # shared TS code (empty for now)
├── supabase/              # migrations, functions, seed
├── docs/                  # this vault
├── CLAUDE.md
└── README.md
```

## Alternatives considered

- **Separate repos per surface (kiosk repo, pos repo, order-engine repo).**
  This was the prior shape and matches the "different language stacks
  belong in different repos" instinct. Rejected because: solo developer,
  every cross-cutting change (schema, order shape, menu shape) becomes
  a multi-repo coordination ceremony; shared types between TS surfaces
  require publishing/versioning a package; PR-shaped review is overkill
  for a one-person project; `git grep` across the whole product becomes
  impossible.

- **Monorepo with build orchestration (Nx, Turborepo, Lerna).** Rejected
  for the current scale. These tools earn their complexity at hundreds of
  packages and a team that needs incremental builds and remote caching.
  At 2 apps + 1 service + 0 shared packages, they add configuration
  burden with no proportional benefit. Plain npm/pnpm workspaces are
  sufficient for the TS side; Python services use a venv and don't need
  to participate in the workspace at all.

- **Mono-repo, but with the order-engine kept separate as a Python-only
  repo.** Tempting because of the language split. Rejected because the
  order-engine's contract with the rest of the system (intent shapes,
  resolver outputs, order shapes) is the most volatile interface in the
  product right now. Co-locating it makes contract changes a single
  commit instead of a dance between repos.

## Consequences


- What gets easier?  - cross-cutting changes, grep, single git log
- What gets harder? - mixed-language tooling, larger clone size, IDE performance with a bigger workspace
- What would force us to revisit this decision? - a second developer
  joining?

> Aim for 4-6 short bullets, in your voice, capturing what *you* think matters about this trade. Future-you reading this in six months should recognise it as something you'd actually say.

