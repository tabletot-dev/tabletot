---
status: accepted
date: 2026-06-05
tags: [kiosk, identity, privacy, petpooja]
---

# 0016 — Kiosk customer identity is per-restaurant: optional name for Silver, mandatory phone for Petpooja

## Context

Until now the kiosk treated every customer as anonymous. Sessions are
keyed by a UUID stored in `sessionStorage`. The dashboard shows session
IDs that are unreadable to a restaurant owner. Floor staff have no way
to address a customer by name when delivering an order.

Two pressures led us to revisit this:

1. **Owner legibility and customer warmth at Silver.** A first-name
   collection — the Starbucks-cup pattern — makes dashboards human-
   readable and creates a small moment of personalization on the kiosk
   waiting screen and on the printed KOT.
2. **The Petpooja DineIn API.** When we onboard a Petpooja-backed
   restaurant, the kiosk *cannot* place an order without first calling
   `save_menu_qr_customer_information` with a customer phone number. The
   phone becomes the PIN for every subsequent API call (validate PIN,
   save KOT, request bill, success payment). See
   `docs/petpooja-dine-api.md` sections 3–10. Phone collection there is
   a hard infrastructure requirement, not a product choice.

The same identity-collection UI needs to support both modes without two
parallel codepaths or a refactor when the Petpooja adapter lands.

## Decision

Identity collection is gated per-restaurant by a config flag on
`restaurants.config`. A new kiosk screen `IdentityView` is rendered
between HomeView and the menu when the flag is on; otherwise the kiosk
goes straight to the menu as before.

For the Silver pilot (this ADR's scope):

- `restaurants.config.prompt_for_identity = true` for Silver.
- Single optional text input: "What should we call you?" with a one-
  sentence disclaimer. Both Continue (with a name) and Skip (without)
  are valid.
- Captured value is written to `sessions.display_name` (nullable text).
  The column is named `display_name` deliberately — it is a label, not
  identity, and must not become a customer key.
- The name is propagated to `kot_tickets.display_name` on KOT inserts so
  the POS Kitchen view can render it.
- The kiosk WaitingView renders a personalized headline when the name is
  set; otherwise the existing wording is used.
- `display_name` is nulled the moment `sessions.status` flips to
  `closed`, via a sibling trigger to `free_table_on_session_close`. No
  retention beyond the visit.

For future Petpooja-backed restaurants (out of scope for this ADR but
the design anticipates it):

- The same `IdentityView` component will be extended with a mandatory
  phone-number field, gated by an additional config flag
  (`require_phone` or similar). A follow-up migration will add
  `sessions.customer_phone`.
- The Petpooja adapter will read `sessions.customer_phone` and pass it
  to `save_menu_qr_customer_information` as part of session start.

## Alternatives considered

- **Name + phone on day one, even for Silver.** Rejected. Phone
  collection at dine-in feels invasive when the customer is sitting in
  front of the staff, drags DPDP Act 2023 obligations into the pilot
  without solving any pilot problem, and adds friction Silver does not
  need. Save the phone collection for the deployment that actually
  requires it.
- **No identity at all, for everyone.** Rejected. Works for Silver but
  fails the moment Petpooja arrives. Building the conditional screen
  now is cheaper than retrofitting it into a critical flow later.
- **Always show the field but make it optional everywhere.** Rejected
  for Petpooja: their API treats phone as mandatory, so an "optional"
  phone in layer mode would silently break order placement.
- **Use `customer_name` as the column name (existing
  `orders.customer_name` precedent).** Rejected. The new field is a
  visit-scoped label, not a customer identifier. `display_name` matches
  intent and reduces the temptation to build loyalty features on a
  field designed to be nulled at session close.

## Consequences

- The kiosk gains one configurable screen. Restaurants without the
  config flag are unaffected.
- The dashboard becomes human-readable for sessions where a name was
  given. Floor staff at Silver can call out names when delivering —
  the actual moment the personalization lands.
- Schema commits to two new columns (`sessions.display_name`,
  `kot_tickets.display_name`) plus a trigger. Both are nullable and
  inert when unused.
- Privacy footprint is minimal: a first-name string with no contact
  channel, nulled at session close. The disclaimer in the IdentityView
  is the consent surface for the pilot — sufficient under DPDP at this
  scope. When phone collection is added, a fuller consent + retention
  policy becomes necessary.
- The Petpooja adapter inherits a working identity-collection
  component. Adding the mandatory phone field is a small UI extension
  and one migration, not a refactor.
- A future ADR will cover the Petpooja extension: phone column,
  retention policy for phone data, and how `IdentityView` renders in
  layer mode.
