# Kiosk customer flow — UX audit

Walked the live kiosk (`kiosk.tabletot.run.place`) end-to-end at tablet
portrait resolution (800x1280, matching the Lenovo Tab K9) to map the actual
customer flow and audit it for friction. #ux-audit

## The flow, as built

```
Welcome (tap anywhere)
  -> Landing/idle (chef's pick carousel, hero copy, Start Ordering CTA)
    -> Menu (category rail + item grid + live cart sidebar)
      -> Dish detail (modal: description, tags, pairing upsell, qty stepper)
        -> Add to Order -> back to menu, pairing nudge now inline on the card
      -> Cart sidebar -> Place Order
        -> Checkout / review (qty edit, GST breakdown)
          -> Confirm Order
            -> Name capture ("What should we call you?", optional, 2 CTAs)
              -> Order confirmed (auto-advances after 5s)
                -> Table display / order tracking (progress %, ad carousel)
                  |- Order More -> back to Menu (new round)
                  |- Request Bill -> itemized bill -> Request Bill at Table
                  |- Request Water
                  |- Games (Tic-Tac-Toe, Connect 4, Word Duel, Ludo)
                  \- Conversation Starters (9 categorized prompt decks)
```

A complete loop — order, track, pay, and something to do while waiting. The
pairing nudge firing on both the modal *and* the grid card after add is a
good double-surface for Pattern 3 without blocking flow. Keep that pattern
exactly as-is in any redesign.

## Where it stops being smooth

### 1. Too many stops between "I want this" and "kitchen has it" (biggest issue)
Tap Add -> modal still open with stepper -> close modal -> Place Order ->
review screen -> Confirm Order -> name capture -> confirmed -> auto-redirect.
That's **6 taps/screens** for a single-item order. The whole pitch is
"faster than waving down a server" — a regular's second visit shouldn't take
longer to order than just asking a waiter.

Collapse candidates:
- Merge "checkout review" and "name capture" into one screen — GST
  breakdown and an optional name field aren't in tension, they can share a
  screen.
- Repeat customers should be able to skip name capture entirely without an
  extra tap (skip exists, but it's still a full screen + a tap).

### 2. Name-capture screen has no visible payoff
"We'll use your name to personalize your visit" — but nothing downstream
(order tracking, bill) shows the name back to the customer. If it's not
surfaced anywhere, the ask is friction with no visible return. On a shared
tablet, typing at all is a bigger ask than it looks — Indian dine-in
customers scanning-and-tapping fast won't want a keyboard between them and
"order sent."

Fix: either surface the name downstream ("Rohan's order is being
prepared") or fold it into a single inline field on the confirm screen
rather than a dedicated stop.

### 3. Floating mic button occludes content
Fixed bottom-center, full size, on every list-heavy screen. Covers the
bottom-row Add buttons on the menu grid and the action row on the Games
screen. Should probably dock to a corner or collapse to a smaller pill when
idle rather than float mid-content everywhere it appears.

### 4. "Now Showing" ad carousel is showing unrelated placeholder content
On the order-tracking screen it cycled through "New Season Edit"
(fashion/apparel copy + model photo) and "Weekend Escape"
(travel/spa copy) — nothing coffee-shop related. Reads as broken or
unfinished, and undercuts trust right when the customer is looking at their
order status. Fix before Silver sees this — highest-severity item on this
list, not just a note.

### 5. Order-tracking progress is under-specified
"Queued — 28%" is honest but customers generally want a time estimate more
than a percentage. Pairing the stage label + percentage with a rough ETA
("~8 min") would reduce "should I ask the server" anxiety — exactly what
this system exists to prevent.

### 6. Recurring layout bug: "TABLE-TOT" watermark overlaps headings
A faint background wordmark sits behind foreground heading text on 4+
screens (landing, checkout, name-capture, order-confirmed) without enough
offset/opacity tuning. Cosmetic, but the kind of thing that makes a pilot
restaurant owner think the app is unfinished — disproportionate to the
actual engineering effort behind it.

## Screens captured
Welcome, landing/idle, menu, dish detail, post-add pairing nudge (modal +
inline card), checkout, name capture, order confirmed, table display /
order tracking, itemized bill, games, conversation starters. Screenshots
not committed to the repo — ask Rohan if he still has the session's output
in `/private/tmp/claude-*/.../scratchpad/kiosk-audit/` or re-run the audit.