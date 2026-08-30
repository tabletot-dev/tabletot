# Tabletot Kiosk Design System

> **Retired 2026-08-30.** This file documented the "Warm Espresso" palette
> (Variant A, approved 2026-05-07). The v1.0 redesign
> (`docs/plans/2026-08-08-kiosk-v1-redesign.md`, Sprints 0–5) replaced it, and
> Sprints 6–7 plus the reduced Task 7.0 (`docs/plans/2026-08-30-kiosk-sprint-6-7.md`)
> removed the last of it — the CSS bridge is gone and no Warm Espresso class
> names or palette values remain in `apps/kiosk`. The old palette/typography/
> shadow tables have been deleted; nothing in the kiosk renders from them.

## The current design system

- **Tokens:** `apps/kiosk/src/styles/tokens.css` — the single source for colour,
  type scale, spacing (8-point), radii, tap targets, and motion. Nothing else
  defines a colour. Elevation is one model: a `2px solid` border. Zero
  `box-shadow`, zero `backdrop-filter` (both vanish under restaurant glare).
- **Rules:** `apps/kiosk/src/styles/tabletot.css` — the `.tt-*` classes that
  build every screen from those tokens. (A tail of pre-`.tt-` class names —
  `.eyebrow`, `.summary-line`, `.panel`, `.order-*`, `.bill-row`,
  `.detail-mic-*`, and the dead pre-v1.0 rules above the `v1.0 SYSTEM` banner —
  still exist; they read `--tt-*` tokens and are slated for a rename/cleanup
  pass, tracked in the sprint-6-7 plan.)
- **Screen spec:** `docs/Tabletot Kiosk - Workflow Handoff.md` (the `.md`
  companion) — the numbered screen-by-screen behaviour, the source of truth
  where it disagrees with the HTML bundle.
