---
status: accepted
date: 2026-09-29
tags: [dashboard, pos, kiosk, architecture, scope]
---

# 0025 — The dashboard owns everything the kiosk shows; the POS runs orders

Supersedes 0008.

## Context

ADR 0008 kept the dashboard curation-only and put menu CRUD in the POS. Since
then most kiosk-facing content has ended up editable nowhere sensible: dish
facts (`menu_items.facts`, which drive the kiosk facts card, the ETA and the
voice AI) and the About-screen text (`restaurants.config`) are SQL-only, the
Wi-Fi name and street address are hard-coded in kiosk code, and completion
rules are view-only in the dashboard. The POS carries two overlapping menu
editors (`Menu.tsx`, and the unrouted `AdminMenuItems.tsx`).

## Decision

`apps/dashboard` is the single place to edit anything the kiosk displays: menu
items (details, photo, tags, dish facts, on/off), venue info (hours, chef
name and note, address, Wi-Fi name and password, voice and name-prompt
switches), completion rules, anchors, pairings and ads. It also keeps the
read-only AOV view. Admin role only.

`apps/pos` is for running orders: start orders, add or remove items, KOT,
billing, payments. Two narrow exceptions stay in the POS, both writing the
same data the dashboard writes so the two can never disagree:

- a **sold-out switch** per dish (`menu_items.active`), open to every POS role;
- the existing **Settings** page (GST rate, restaurant name, currency).

Dishes are switched off, never deleted, from the dashboard. Customer add-ons
and sizes (modifiers) are out of scope; the kiosk does not read them.

## Alternatives considered

- **Keep menu CRUD in the POS (0008)** — rejected: the POS is a counter tool,
  and half the kiosk-facing content had no editor there anyway.
- **Dashboard only, no POS sold-out switch** — rejected: marking a dish
  sold-out is a mid-service job for whoever is at the counter.
- **Server-side admin API instead of direct Supabase writes** — deferred; the
  existing RLS (migration 0068) already gates writes to authorised staff.

## Consequences

- One editor per kind of data; the POS menu editors are removed.
- The dashboard's admin key for the voice-engine menu refresh is a `VITE_`
  variable, visible to anyone who can load the page (same as the POS today).
  Move it server-side if the dashboard ever has non-admin users.
- Wi-Fi password lives in `restaurants.config`, readable by the kiosk's public
  key. It is already shown to customers via the QR.
- Revisit if a restaurant with its own POS/admin is onboarded (Petpooja):
  the dashboard menu editor would then need to be gated off for that provider.
