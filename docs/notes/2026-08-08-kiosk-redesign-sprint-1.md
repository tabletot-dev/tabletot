# Kiosk redesign — Sprint 0 & 1 done

Working from `docs/plans/2026-08-08-kiosk-v1-redesign.md`, simple scope
(Sprints 0-5) in progress, one commit per sprint.

## Sprint 0
- `aov-attribution.test.tsx` pins `pairing_chip` / `completion_nudge` event
  attribution (the two sources `get_aov_summary`, migration 0050, reads for
  `direct_revenue`). Passed against the unmodified codebase before any
  redesign work started, per the plan's gate.
- Sentry (`@sentry/react` v10) wired in `src/lib/sentry.ts`, no-op without
  `VITE_SENTRY_DSN`. One deviation from the plan's snippet: current Sentry
  docs say to *omit* `tracesSampleRate` entirely to disable tracing, not set
  it to `0` — the plan predates that guidance. DSN/Railway var still need to
  be set manually (see Manual Steps in the plan).

## Sprint 1
- `src/styles/tokens.css` — the v1.0 token set, `--tt-scale` derived once at
  boot in `main.tsx` from the narrower viewport axis, clamped 0.75–1.6.
- `src/styles/tabletot.css` cut from 9258 → 5863 lines: removed the second
  and third `:root` override layers (former lines 5050–8405) and the
  redundant tail re-styles (`.header-status-return`, `.bill-view`), while
  keeping `.classic-ludo-*`, `.classic-dice-face`, `.bill-phone-*`,
  `.bill-flow-*` intact — those are the only definitions for screens not yet
  rebuilt (Ludo → Task 6.2, Bill → Task 5.2). The remaining single `:root`
  bridges old variable names (`--brand`, `--panel`, `--shadow-md`, etc.) onto
  the new `--tt-*` tokens so untouched screens (Games, Table Talk, voice,
  and every screen before its own sprint) render on-palette without editing
  713 selectors individually.
- Appended the `.tt-*` component library (buttons, fields, chips, dish card,
  stages, toast, badge, skeleton, all interactive states) per Task 1.3.
- **Known plan inconsistency, not fixed:** Task 1.2's Step 6 verification
  expects zero literal `box-shadow`/`backdrop-filter` file-wide, but Step 2
  of the same task explicitly preserves the Ludo/bill-phone/bill-flow
  families, which have their own `box-shadow` rules, and the base layer
  (screens not yet rebuilt) has many more. Deleting those now would mean
  redoing work Tasks 5.2/6.2 are scheduled to do, and would break rendering
  on screens ahead of their own sprint. Left as-is; the new `.tt-*` system
  itself has zero shadow/blur declarations, which is the part that's
  actually new.
- Full visual walkthrough via gstack `/browse` at 800×1280 with local
  Supabase running: Attract → Home → Menu (live items, pairing panel firing
  correctly) → Cart → Confirmation → Table Status → Games → Tic-Tac-Toe →
  Ludo (board + dice, the preserved family) → Table Talk → Bill. Nothing
  rendered unstyled; screens not yet rebuilt look plain but intentional.

Docs `design-system.md` and `kiosk-visual-design-current.md` are still
accurate to describe the *old* palette in places the redesign hasn't reached
yet — deferred update to end of Sprint 5 per the plan's own "Docs to update
once it ships" list, rather than rewriting them mid-migration.
