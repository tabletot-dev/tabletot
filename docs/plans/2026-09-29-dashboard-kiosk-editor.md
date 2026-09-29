# Dashboard as kiosk editor — plan

Decision: ADR 0025. Branch: `feat/dashboard-kiosk-editor`. Illustrated version
(diagram + screen mock-ups) lives in the Claude Docs artifact "Dashboard as
Kiosk Editor — Plan".

## Steps

1. ADR 0025, supersede 0008, update `CLAUDE.md`.
2. Dashboard **Menu** screen: name, price, category, description, Veg/Non-Veg,
   on/off, tags, photo upload, dish facts. No delete. Category clean-up and
   voice-engine menu refresh carried over from POS `Menu.tsx`.
3. Dashboard **Venue** screen: hours, chef name/note, voice + name-prompt
   switches, address, Wi-Fi name + password, GST rate (same
   `restaurant_settings` row as POS Settings). Kiosk reads Wi-Fi/address from
   `restaurants.config` and generates the QR (hard-coded values stay as
   fallback).
4. Completion Rules editable (form, no raw JSON).
5. POS: replace `Menu.tsx` with a sold-out list (all roles), delete
   `AdminMenuItems.tsx`.

## Decisions (2026-09-29)

- POS keeps a sold-out switch, open to all roles.
- Dishes are switched off only, never deleted.
- GST editable in dashboard and POS Settings (one shared row).
- Wi-Fi stored as text; kiosk generates the QR.

## Out of scope

Customer add-ons/modifiers, multi-restaurant switching in the dashboard,
category as its own object, voice pipeline code.
