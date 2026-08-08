# Tabletot Kiosk — Workflow Handoff

**Version 1.0 · Production**
Customer-facing table kiosk · 800 × 1280 portrait · 19 screens
Companion to `Tabletot Kiosk v1.0 Handoff.html` (design, component library, full spec)

---

## 1. The session model

A **session** begins when a guest first touches an idle kiosk and ends when the table is cleared by staff at the POS. Everything below happens inside one session.

Within a session, orders are grouped into **rounds**. A round is one submission to the kitchen. Coffee, then food, then dessert is the normal pattern — rounds are the spine of the product, not an edge case. Every list in the product (cart, bill, status) is grouped by round, and each round carries its own kitchen stage.

Key consequence for engineering: `round_number` is the grouping key everywhere. A guest can be looking at Round 2 in the cart while Round 1 is plating, and both must be visible without confusion.

---

## 2. End-to-end flow

```
01 Attract / Welcome
      │  first touch
      ▼
02 Menu / Browse ◄──────────────┐
      │                         │
      ├─► 05 Dish Detail ───────┤
      ├─► 06–08 Voice (overlay) ┤
      │                         │
      ▼                         │
09 Order / Review               │
      │  Send to kitchen        │
      ▼                         │
11 Order / Sent                 │
      │  (120s change window)   │
      ▼                         │
13 Table / Status ──────────────┘  "Order another round"
      │
      ├─► 12 Table / Waiting (ads, after 45s idle with a round in flight)
      ├─► 14 Table / Bill
      ├─► 17 Activities / Hub ─► 18 Connect Four · 19 Table Talk
      └─► 16 Venue / About
```

### Stage by stage

**Entry — 01 Attract / Welcome**
The idle state. Venue lockup, one line of orientation, and two ways in: touch anywhere, or speak. **No advertising appears here.** A guest who has not ordered is never shown a promotion.

**Discovery — 02 Menu / Browse**
The persistent ordering surface. There is no Home screen; venue information lives at 16 and is reached from the app bar. Category chips filter in place. The voice dock is docked at the base and the order bar sits above it.

Supporting states: **03 Loading** (skeleton, never a bare spinner), **04 Empty Result** (a filter returning zero rows always renders this, never an empty list).

**Detail — 05 Menu / Dish Detail**
Full-screen push, not a modal. Carries the description, allergen and prep-time chips, required modifier groups, and pairings.

**Voice — 06 Listening · 07 Recommendation · 08 Informational Answer**
An overlay available from every ordering screen, never a route. It always returns the guest exactly where they were. Two answer shapes:
- **07** — the answer is a recommendation, so dish cards render inside the answer card and can be added directly.
- **08** — the answer is a question of fact (calories, allergens, hours), so it renders as **text only**, with no cards.

Closing the overlay never destroys the thread; the conversation is retained for the session and reopens where it ended.

**Order — 09 Review**
Separates *this round, not yet sent* from *rounds already with the kitchen*, with an explicit line saying the cooking round is unaffected. Name capture is one optional inline field here — it is not a screen and never blocks sending.

**10 Order / Cancel Confirm** is an interrupt, not a destination.

**Sent — 11 Order / Sent**
Does **not** auto-advance. The order is held for **120 seconds** during which the guest can edit or cancel. The ETA is stated in minutes. The guest chooses when to leave.

**Waiting — 12 Table / Waiting**
This is where promotional creative runs. Reached from 13 after **45 seconds of inactivity while a round is in flight**. The venue's creative cycles (up to 4 per loop, 8s each) with the live kitchen stage pinned along the bottom. **Any touch returns to 13.**

**Session home — 13 Table / Status**
The home base for the rest of the visit. Live kitchen stage per round, the promo slot, and peers of ordering: another round, games, table talk, water, call staff, bill.

**Settlement — 14 Table / Bill**
Grouped by round. Optional SMS receipt field. No payment is taken on the device — a server comes to the table.

---

## 3. Idle and timeout rules

| Condition | After | Goes to |
|---|---|---|
| Round in flight, no touch | 45s | **12 Table / Waiting** — ads cycle, stage pinned |
| Empty cart, nothing in flight | 90s | **01 Attract / Welcome** — no advertising |
| Cart has items, not yet sent | never | stays put — an open cart is never interrupted |
| No active promo configured | — | stays on 13; never enters 12 |

---

## 4. What is interactive, and what it does

| Element | Behaviour |
|---|---|
| **Add / Add to order** | POST cart line. Optimistic insert; the stepper replaces the button in place. Failure rolls back and raises an error toast. |
| **Stepper − / +** | PATCH quantity. `−` at qty 1 removes the line and offers **Undo for 8s**. `+` disables at the item stock limit. |
| **Dish card body** | Push 05. Horizontal push, 240ms. |
| **Category chip** | Filter in place, no navigation. Scroll resets to top. |
| **Diet filter** | Client-side filter on the loaded menu. Zero results → 04. |
| **Review order** | Push 09. Disabled while the cart is empty. |
| **Send to kitchen** | POST order. Button enters loading and is **non-reentrant**. Success → 11 and start the 120s window. Failure stays on 09 with a Retry toast. |
| **Edit / Cancel round** | Only within 120s. After the window both controls are **removed, not disabled**. |
| **Voice mark** | Tap starts capture, tap again stops. Dock expands in place. Never navigates. |
| **Close ✕ on voice** | Collapses the dock; conversation retained for the session. |
| **Water / Call staff** | POST service request. Confirmed state for 4s. Rate limited to one per type per 90s. |
| **Order more (in game)** | Push 02 with the game serialised. Returning restores the exact board. |
| **Ask for the bill** | POST bill request; notifies POS. No payment on device. |
| **Promo card / Waiting screen** | Tapping Add adds the retail SKU as a normal cart line. Any touch on 12 returns to 13. |

---

## 5. Data the kiosk needs from the backend

Nothing is hard-coded in the client.

| Entity | Purpose |
|---|---|
| `venue` | Lockup, hours, chef note, wifi — drives 16 and the Welcome footer |
| `table` | Table label in the app bar; kiosk is bound at provisioning |
| `category` | Chips in sort order; outside its window renders disabled, not hidden |
| `menu_item` | Name, description, price, diet, photo, prep time, allergens, calories, macros, stock state |
| `modifier_group` / `modifier` | Required groups block Add until satisfied; sold-out modifiers render disabled |
| `pairing` | "Goes well with" — max two per dish |
| `order` / `order_line` | Grouped by `round_number`; prices snapshotted at add time |
| `bill` | Grouped by round; settled at POS |
| `service_request` | water · cutlery · staff · bill · issue |
| `promo` | Drives **12 Table / Waiting** and the 13 promo slot — post-order only |
| `voice_turn` | Persisted per session so Close never destroys the thread |
| `game_state` | Written on every move and on "Order more" so boards survive navigation |

**Conventions.** Money as integer minor units with an explicit currency, never a float. Time as ISO-8601 UTC, formatted venue-local on the device. Order status and stock arrive on a realtime channel keyed by `table_id`; every screen holds a last-known-good render and a last-updated timestamp, and falls to **15 System / Connection Error** with backoff retry on channel loss.

---

## 6. Form validation

Only four inputs exist in the whole product.

- **Order name (09)** — optional, 1–40 chars. Never blocks Send.
- **Mobile for receipt (14)** — optional, exactly 10 digits after +91. Validate on blur. Never blocks the bill request.
- **Modifier group (05)** — required groups must meet `min_select`; Add stays disabled until satisfied.
- **Note to server** — optional, 140 char hard stop with a live counter from 120.

Rules that hold everywhere: validate on blur and submit, never on keystroke. One message per field, below it, 17px/700 in `--tt-action`. Errors never clear a field. Border weight stays 2px in error so nothing shifts.

---

## 7. Responsive behaviour

This is a fixed-portrait kiosk, not a responsive web app. There is no reflow and there are no content breakpoints — the layout is one column at every size.

| Target | Viewport | Behaviour |
|---|---|---|
| Reference | 800 × 1280 | 1:1. All design values are literal px at this size. |
| 4:3 tablets | 768 × 1024 | Scale 0.80. The scroll region absorbs the loss; bars keep pixel heights so tap targets never drop below 64px. |
| Large kiosk | 1200 × 1920 | Scale 1.5. Do not add columns — centre the 800px column. |
| Landscape | any | Not supported. Lock orientation at OS level; otherwise show a rotate prompt. |

One CSS custom property, `--tt-scale`, is set once from the viewport at boot; all spacing and type tokens derive from it.

---

## 8. Brand tokens

| Token | Value | Use |
|---|---|---|
| `--tt-ink` | `#111310` | All type and structural borders. 18.4:1 on paper. |
| `--tt-ink-60` | `#43483F` | Secondary type only. 9.1:1 on paper. |
| `--tt-action` | `#F36C31` | Fill only, white label. The single next action. Never text, border or glow. |
| `--tt-action-press` | `#D95A22` | Hover / pressed |
| `--tt-paper` | `#FFFFFF` | Cards and bars. Fully opaque — no rgba, no blur. |
| `--tt-field` | `#EDECE6` | Page behind cards. Flat. |
| `--tt-line` | `#C9C7BF` | Default 2px border |
| `--tt-disabled` | `#8A8E87` | Disabled label and icon |
| `--tt-veg` | `#0E7A3C` | Vegetarian mark, always with a circle |
| `--tt-nonveg` | `#9B1C1C` | Non-vegetarian mark, always with a triangle |
| `--tt-info` | `#12457E` | Informational only, never an action |

**Type.** Sora 800 at 56px display · Sora 700 at 40px headings and 26px dish names · Manrope 800 at 24px for CTAs (the floor — never smaller) · Manrope 500 at 20px body · Manrope 700 at 18px labels.

**Geometry.** Spacing 8/12/16/24/32/48/64. Radii 12 chips · 18 cards · 999 pills. **One elevation model: a 2px solid border. Zero box-shadows** — they vanish in glare. Tap targets 64px minimum, 88px primary.

**Motion.** 120ms state, 240ms navigation, ease-out. Screens push horizontally; sheets grow from their dock. The only looping animation is the voice waveform, because it is a status.

---

## 9. Build notes

1. **Self-host Sora and Manrope as woff2.** The previous build named Archivo, Inter and JetBrains Mono in 56 CSS declarations without ever loading them.
2. **Replace all three legacy `:root` blocks** with the single token set above, and delete the theme block in `index.css`.
3. **Strip every `box-shadow` and `backdrop-filter`.** Borders carry depth now.
4. **Portrait is one column.** Every two-column split from the old build is removed; the pattern is header → scroll region → docked bars, with the bars always `flex: none`.
5. **Kept from the old build:** the double-surface pairing nudge, the null-photo category fallback, the 64px tap floor, and the veg/non-veg mark — now 36px and shape-led.

---

## 10. Extending without redesign

Every screen is assembled from eight primitives: **AppBar, NavBar, one scroll region, OrderBar, VoiceDock, StatusStrip, Modal, Toast**. A new screen is a choice of top bar, a scroll region filled with existing components, and a choice of bottom bar. No new chrome should ever need drawing.

- New category → chip + existing DishCard list. Zero new components.
- Combo / set meal → DishCard with a required modifier group. Already specified.
- Loyalty → Badge + the 13 promo-slot pattern.
- Split bill → bill rows + Stepper + existing modal.
- New game → Hub tile + a board between NavBar and StatusStrip.

**Rules that keep it scalable.** One elevation model — adding a shadow breaks the system. One action colour per screen; if two things look equally primary, one of them is not. Every new colour must be a token with a stated contrast ratio. Every interactive element ships all six states before it ships at all.
