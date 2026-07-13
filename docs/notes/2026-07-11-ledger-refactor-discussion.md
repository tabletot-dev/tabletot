# Ledger Refactor Discussion — 2026-07-11

Status: **proposal, not decided.** Promote to an ADR (0019) if/when Rohan commits
to it. Companion to the same-day bug audit
(`2026-07-11-codebase-bug-audit.md`) — read that first; this note explains why
those bugs share one root cause and what architecture removes the class.

---

## 1. Diagnosis: one architecture, not fifteen bugs

Audit items C1, C2, C3, H1, M1, M4, M5 are the same bug wearing different
costumes: **the truth about "what is happening at table N" is smeared across
five places** — kiosk `sessionStorage`, React state, `orders` rows,
`restaurant_tables.status`, and Realtime events that may not arrive while the
tablet sleeps. Three apps write shared tables in slightly different shapes;
triggers + Realtime try to glue it back together. Every race in the audit is
the glue failing.

Plain-language version: three waiters each keep their own notepad for the same
table and sync by yelling across the room. Whoever missed a yell acts on wrong
notes.

## 2. Proposed architecture: "the table is the database"

One append-only ledger, one writer, table (not session) as the root identity.
The database becomes the brain; the tablet becomes a screen.

### 2.1 One events table, one RPC
```
table_events(
  event_id uuid PK,   -- generated client-side → retries are idempotent no-ops
  restaurant_id, table_id, seq,
  type, payload jsonb, created_at
)
```
Every action in the system is one appended row: item added (with
`source: 'pairing_nudge'` riding on it), order submitted, KOT bumped, bill
requested, payment settled. All writes go through a single `append_event()`
Postgres RPC that validates a small allowed-transitions state machine.
No app writes tables directly.

### 2.2 Sessions are derived, not stored
A "session" = the span of events between two `table_settled` markers. No
session row to create (kills C1), no stale session key to brick the kiosk
(kills C2), no "close old session" step nuking a new customer (kills C3).

### 2.3 Kiosk as dumb terminal
Zero business logic, zero persistent client state. On boot/wake/reload it asks
one question: "current state of table N" (a SQL view over the ledger).
Realtime demoted from load-bearing state transport to a poke: "table N
changed, refetch." A missed event costs one stale render, not a bricked
session. Taps are optimistic — render instantly, append in background — so the
network is never between a finger and a pixel.

**Acceptance test: power-cycle any device at any moment and the system
converges.** The restaurant floor runs this test daily whether we like it or
not.

### 2.4 Analytics stop being a second pipeline
Bill view, KOT queue, POS orders screen, and the AOV report are all SQL views
over the same ledger. Bill can't disagree with its itemization (M1) — same
query. Attribution can't drift from revenue (H1, M6) — the recommendation
source is a field on the event that created the revenue.

### 2.5 What gets deleted
- Kiosk event bus + retry queue (`eventBus.ts`)
- Session-lifecycle triggers (0019 table-freeing, 0035 status trigger)
- `sessionStorage` session keys, the `ignoreDuplicates` upsert dance
- `items_json` shape reconciliation between POS and kiosk
- All "reload amnesia" code
- `recommendation_events` table (already dead — audit L7)

### 2.6 What stays untouched
Voice (frozen; already a thin client — it just emits events), Supabase, React,
SQL-only recommendation rules, the menu model, all screens/UX. This is a
**write-path rewrite only**: roughly one migration, one RPC, and swapping
direct table writes for `append_event` calls.

## 3. Audit mapping: what the ledger kills vs. what survives

| Killed structurally by ledger | Survive — fix independently |
|---|---|
| C1, C2, C3 (session lifecycle races) | H2 (dead anchor rail — typecheck bug) |
| H1 (AOV double-count — idempotency keys) | H4 (voice `/admin/refresh-menu`) |
| H5 double-submit half (idempotent submits) | H3 (missing `restaurant_id` defaults) |
| M1 (bill vs. itemization) | H5 rule-loop half (rule validation) |
| M4 (POS/kiosk shape drift — one writer) | M2, M7 (error handling, NaN validation) |
| M5 (reload amnesia) | M8 (RLS / PII exposure) |
| M6 attribution half | L5, L6, L8 (images, phone regex, no tsc) |

## 4. Process decisions (independent of the ledger — do regardless)

1. **One app, not three.** Kiosk/POS/dashboard as routes in a single Vite app
   behind a role flag. Shared Supabase types can't drift; one build to put
   `tsc` in. H2 is a build-config bug wearing a feature-bug costume.
2. **Typecheck in the build.** Kiosk and POS run `vite build` only (audit L8).
3. **One golden-session test.** Script against local Supabase: seat → browse →
   nudge accept → submit → round 2 → KOT → bill → settle → assert AOV view.
   Catches C1, H5, M1, M3, M4. One test, not a suite. Run in CI with tsc.

## 5. Decisions from follow-up discussion

### 5.1 SSR — rejected
Server-side *deciding* ≠ server-side *rendering*. SSR only speeds first page
load; the kiosk PWA loads once at 6 AM from service-worker cache and runs all
day. Lag is interaction rendering, not loading. SSR adds a server + failure
modes for zero visible benefit.

### 5.2 Tablet performance plan (Lenovo Tab K9)
Fix in this order, and **profile on the real device first** (Chrome
`chrome://inspect` → Performance trace; purple = GPU/rendering, yellow = JS):
1. **GPU-expensive visuals** — `backdrop-filter`, blur, big animated
   box-shadows in `tabletot.css`. Animate only `transform`/`opacity`.
   Usually the single biggest win on budget GPUs.
2. **Images** — pre-resize to card size, WebP, precache via service worker
   (also fixes audit L5 Unsplash hotlinks).
3. **Over-rendering** — memoize dish cards; audit whether `menuStore` updates
   redraw the whole app per tap.
4. Scheduled daily reload (~6 AM) against all-day memory creep.

### 5.3 Framework — stay on React
Facts (krausest js-framework-benchmark): Solid/Svelte 5 are within a few
percent of vanilla JS; React is ~40–60% slower **on 1,000-row table
operations**. At kiosk scale (~49 cards) that gap is 1–3 ms per interaction —
invisible next to one blur (10–30 ms/frame) or one oversized image decode
(100 ms+). Bundle-size gap (React ~45 kB vs Preact ~4 kB gz) is irrelevant for
a once-a-day cached PWA. Rewrite = weeks + unknown new bugs + touching frozen
voice. Escape hatch if a trace ever blames React itself: `preact/compat`
(drop-in Vite alias). Expectation: it won't, at 49 items.

### 5.4 Dish image optimization — at upload time, in the POS browser
Astro-style image optimization happens at build time; dish photos arrive at
runtime (owner uploads via POS), so the equivalent is **optimize once at
upload**. Decision: resize in the POS browser before upload — canvas capped at
~800px wide, export WebP at ~0.8 quality, upload that instead of the original
(4 MB phone photo → ~60–80 KB). ~25 lines in the POS upload handler, no new
infra, free.

Rejected alternatives:
- **Supabase Storage transformations** (`?width=&format=webp`) — Pro-plan
  feature (~$25/mo), not on free tier. Revisit post-pilot if many restaurants.
- **Server-side resize** (Edge Function / FastAPI + image lib) — infra for a
  problem the browser solves.

Known ceiling: images inserted by hand in Supabase Studio bypass the POS and
stay unoptimized. Acceptable for the pilot — the POS form is the only real
door. Pair with kiosk service-worker precache of menu images (§5.2) so the
tiny images load from tablet disk, not restaurant Wi-Fi.

## 6. Honest caveat / decision fork

Right architecture for the product (a restaurant floor is an event log wearing
an apron), but it is a write-path rewrite mid–hardware-testing.

- **Pilot date close** → fix forward: audit cluster 1 (C1, C2, C3, H5) + steal
  the two cheapest ledger ideas: idempotency keys on submits, and
  table-state-on-boot instead of sessionStorage.
- **~3 weeks of slack** → ledger version is less total work than whack-a-mole,
  because most of it is deletion.
