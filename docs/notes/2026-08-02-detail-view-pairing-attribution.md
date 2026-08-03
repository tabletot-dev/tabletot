# Detail-view pairings now count under ADR 0018's attribution rule

Part of `docs/plans/2026-08-02-three-app-hardening.md` Task 3.3. Not an ADR —
this extends an existing surface into a rule [[0018-upsell-attribution-rule]]
already defined, rather than changing the rule itself.

## What changed

The item-detail screen's "Pairs well with" panel (`DetailView.tsx`) added
items with `source: 'detail_view'`. ADR 0018's attribution rule only counts
`source ∈ {pairing_chip, completion_nudge}` — so every add from this panel
was invisible to `get_aov_summary`, even when the pairing was genuinely
curated (`item_pairings`, not fabricated).

Fixed by emitting `source: 'pairing_chip'` from this panel's add handler
instead of `detail_view`. This was a deliberate choice between two options
the plan named:

- **Chosen: reuse `pairing_chip`.** Same surface intent as the grid card's
  inline pairing chip (`DishCard.tsx`) — "here's a curated pairing, one tap to
  add" — just rendered in a different screen. No migration needed;
  `get_aov_summary` already counts this source.
- **Rejected: add `detail_view` to the RPC's counted-sources list.** Would
  have required a new migration to extend `0050`'s `IN (...)` clause for a
  distinction (which screen the chip was tapped from) that doesn't change the
  economic question ADR 0018 is answering: was this add caused by a curated
  suggestion, yes or no.

`recommendation_shown`/`recommendation_tapped` also now fire from this panel
(previously: neither), using `surface: 'inline_pairing'` — the same value
`DishCard.tsx` already uses for the grid-card version of the same pattern, so
the acceptance-rate widget doesn't need a new surface category to interpret.

## What this does NOT change

ADR 0018's rule itself is untouched — an item still needs both a qualifying
`source` on `item_added` AND survival into the submitted order's
`items_json`. This note just documents that the detail-view panel is now one
of the surfaces capable of producing a qualifying `source`, alongside the
grid card and the completion nudge.

## Related fix, same task

`getDetailPairings` (`Index.tsx`) used to fabricate a fallback pairing when
nothing was curated for an item — signature anchor → chef's pick → any
coffee/tea item → any menu item at all — rendered under "Pairs well with" as
if it were curated (audit M6). That fallback is deleted; no curated pairing
now means no panel. This matters for this attribution question specifically:
before the fix, an uncurated fallback pairing's add would have been
attributed as `detail_view` (uncounted) — after this fix, it's simply not
possible to add a fabricated pairing from this panel at all, so there's no
new failure mode where a fabricated suggestion becomes `pairing_chip`-counted
revenue.
