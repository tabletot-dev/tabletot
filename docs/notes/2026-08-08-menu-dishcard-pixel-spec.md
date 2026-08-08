# Menu screen + Dish card rebuilt to reference spec

The client supplied a "Dish card" component spec sheet and the full "02 Menu
/ Browse" screen. Diagnosis found the existing `DishCard`/`.tt-dishcard` was
a vertical/stacked card built during Sprint 3 as a class-rename onto the old
layout, never rebuilt to this reference's horizontal-row shape. Fixed:

- `DishCard.tsx` restructured into a horizontal row (fixed square thumbnail
  left, name + description + price middle, Add/stepper right). The pairing
  panel's markup/logic (`aria-label`, `handleAddPairing`, the
  `shownPairingIds` effect) is untouched — only its position changed.
- `item.description` (already fetched from Supabase, never rendered) now
  shows under the dish name.
- `DietMark.tsx` migrated off hardcoded hex colors onto `--tt-veg`/
  `--tt-nonveg`. Veg is a circle, non-veg is a **triangle** (via
  `clip-path`) — matches what `tokens.css` already documented but the
  component never implemented.
- `AppBar.tsx` gained the two-line brand/venue lockup + divider, mirroring
  the Attract screen's header pattern. Unlike the Attract screen (hardcoded
  "Silver"/"Specialty Coffee" per an earlier explicit decision), AppBar
  splits the dynamic `venueName` prop on its first space — it's shared
  chrome across every screen, not pilot-specific copy.
- `itemImageBackground()`'s no-photo fallback (`menuImages.ts`) changed
  from a colored category-gradient to a dashed-border box with a faint "T"
  watermark, applied everywhere the function is used (DishCard, HomeView
  hero, DetailView, CartView, pairing thumbnails, VoiceConversationPanel) —
  a single-function change, zero markup changes in any consumer.
- Category chips (`MenuView.tsx`) dropped their per-category icon
  (`CategoryIcon.tsx`, now unused but not deleted) — reference chips are
  text-only. The Veg/Non-veg segmented filter now shows the fixed
  circle/triangle `DietMark` next to its label.
- Menu header's "Now browsing" badge + repeated category `<h1>` replaced
  with a plain "{count} dishes" heading (category is already shown via the
  active chip).

## To-do: sold-out state

The reference's dish-card spec sheet includes a fourth "sold out" variant
(grayed card, "SOLD OUT" badge, "Notify me" button). **Not built this
pass** — there's no `available`/`sold_out` field on `MenuItem` or in the
Supabase `menu_items` schema, so this is new functionality, not a restyle.
Explicit user decision: skip for now, flag here for later. When picked up,
it needs a schema migration (append-only, per repo convention) plus
threading the field through `menuStore.tsx` → `MenuItem` → `DishCard.tsx`.

## Update: quantity stepper restyled

The client supplied a "Quantity stepper" spec sheet (Default, At Minimum,
At Stock Limit, Disabled · Sent). `.tt-stepper` (`tabletot.css`) was a solid
black pill with two identical white buttons — rebuilt to a white pill with
an ink border, a plain "−" icon, and a "+" button filled orange that fills
the pill's right cap edge-to-edge, matching the reference. Used by
`DishCard.tsx` (main card + inline pairing row), `DetailView.tsx` (main +
pairing row), and `CartView.tsx` (line items) — all five get the new look
for free via `:first-of-type`/`:last-of-type` selectors, no JSX changes to
the base look needed.

Two of the four reference states are real and wired:
- **Default** — `qty > 1`.
- **At Minimum** — `qty === 1`. The minus button gets a
  `tt-stepper-minus--floor` class (added at each of the 5 call sites) that
  mutes its color. It stays fully clickable — tapping still removes the
  item at qty 1, unchanged behavior.

Two more exist only as CSS, same as sold-out — no call site sets them yet:
- **At Stock Limit** — the native `button:disabled` state is styled (muted
  fill), but nothing sets `disabled` because there's no max-quantity/stock
  field on `MenuItem` anywhere.
- **Disabled · Sent** — a `.tt-stepper--locked` modifier mutes the whole
  container, but nothing applies it — there's no "this line was already
  sent, now locked" concept in the app (`CartView`'s only existing lock is
  the full-screen submitting overlay, not a per-line state).

Both need a data model decision before they can be wired for real — same
follow-up bucket as the sold-out card state above.
