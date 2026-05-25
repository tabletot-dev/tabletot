# Tabletot Kiosk Design System

**Approved direction:** Variant A — "Warm Espresso"  
**Approved:** 2026-05-07  
**Applies to:** `apps/kiosk` (customer-facing PWA)

---

## Visual Identity

### Palette

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f8ece4` | Page background (warm cream) |
| `--panel` | `rgba(255,250,245,0.96)` | Cards, sidebars, overlays |
| `--panel-strong` | `#fff8f2` | Elevated panels |
| `--panel-dark` | `#17110f` | Hero cards, dark surfaces |
| `--text` | `#211715` | Primary text (near-black brown) |
| `--muted` | `#6f5b54` | Secondary text, labels |
| `--soft` | `#9f887e` | Placeholder, eyebrow text |
| `--brand` | `#ff5b4a` | Primary CTA, active states |
| `--brand-deep` | `#ed382a` | CTA hover/pressed |
| `--brand-gold` | `#f0c16d` | Tags, accents, highlight |
| `--green` | `#518654` | Veg indicator |
| `--line` | `rgba(46,24,18,0.08)` | Dividers, card borders |

Background always uses the radial gradient defined in `tabletot.css` — never a flat colour.

### Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Display headline | Sora | 800 | 40–50px |
| Section heading | Sora | 700 | 24–32px |
| Body | Manrope | 400–600 | 14–17px |
| Eyebrow | Manrope | 700 | 11–13px, uppercase, letter-spacing 0.08em |
| Price | Sora | 700 | context-dependent |
| Button | Manrope | 700 | 16–18px |

Both fonts are self-hosted as variable woff2 files in `apps/kiosk/public/fonts/`.

### Spacing & Shape

| Token | Value |
|---|---|
| `--radius-xl` | `34px` — hero cards, feature panels |
| `--radius-lg` | `26px` — secondary panels |
| `--radius-md` | `20px` — utility cards, compact items |
| `--radius-sm` | `16px` — tags, compact cards |
| `--touch` | `64px` — minimum tap target height |
| Pill buttons | `border-radius: 100px` |

### Shadows

```css
--shadow-lg: 0 32px 64px rgba(46,23,17,0.16)  /* hero cards */
--shadow-md: 0 18px 34px rgba(46,23,17,0.10)  /* panels */
--shadow-sm: 0 8px  20px rgba(46,23,17,0.06)  /* subtle lift */
```

---

## Component Patterns

### Eyebrow + Heading

Every view section opens with an eyebrow label above the heading. Eyebrow uses `.eyebrow` class (uppercase, `--soft` or `--brand`). Heading uses Sora.

```tsx
<p className="eyebrow">Good evening, Table 14</p>
<h1>Order beautifully. Without waiting.</h1>
```

### Buttons

**Primary:** Coral fill, white text, 64px height, `border-radius: 100px`.  
**Secondary / Ghost:** White bg or transparent, dark border, same height.  
**Destructive / Back:** Plain text, `--muted` colour, no chrome.

Never use inline `style` for button colour — always `primary-btn`, `secondary-btn`, `ghost-pill`.

### Tags

```
.tag-dark   — #211715 bg, white text       — Chef's Pick
.tag-accent — #ff5b4a bg, white text       — Best Seller  
.tag-light  — rgba(white,0.9) bg, dark text — Signature
.tag-green  — #518654 bg, white text       — New / Veg
```

### Panels

All content sits on `.panel` (translucent white, `--radius-lg`, `--shadow-md`). The hero feature card uses `--panel-dark` with a food-photo `background-image` and a dark gradient overlay.

### Image Fallback

`menu_items.image_url` is nullable. All components that render food imagery must fall back to the category gradient from `CATEGORY_GRADIENTS`. Do not remove the fallback — images may be absent in dev or for new menu items.

---

## Screen-by-Screen Spec

### HomeView
**Layout:** Header bar + horizontal split (copy 44% / hero card 56%) + utility strip.

- Header: logo left, nav pills centre, cart button right.
- Copy side: eyebrow → headline (Sora 800, two lines) → subtext → CTA buttons.
- Hero card: `background-image` food photo + dark gradient overlay. Tags top-left. Dish name + price + "View Dish" pill bottom. Pagination dots.
- Utility strip: 3 equal info cards (Dietary, Wi-Fi, Hours). Use `--radius-md`, subtle border.
- Rotating hero: cycle chef-pick anchor items every ~4s on a `setInterval`.

### MenuView
**Layout:** Sidebar (category list) + canvas (toolbar + product grid).

- Sidebar: `--panel` bg, fixed width ~240px, category buttons with SVG icon + label. Active state: `--panel-dark` bg, white text.
- Canvas header: eyebrow "Now browsing" + `h1` category name.
- Toolbar: diet filter pills (All / Veg / Non-Veg) + item count.
- Grid: `DishCard` components. 3 columns on 1340px wide tablet.
- Cart float: when `order.length > 0`, show a sticky cart summary bar at the bottom of the canvas linking to CartView.

### DetailView
**Layout:** Split — photo panel left (50%) / detail panel right (50%).

- Photo: `background-image` (or gradient fallback), fills panel edge-to-edge, `--radius-xl` corners on the containing `.detail-layout`.
- Detail panel: eyebrow (category) → `h1` (name) → facts grid (category, diet, price) → tags → pairings list → Add to Order CTA full-width.
- Pairings: max 2 compact cards. Each: 64px square gradient/photo thumb + name + price. No add button on pairing cards in this view — tapping navigates to that item's DetailView.
- Back link: plain text below the CTA, `--muted` colour.

### CartView
**Layout:** Split — order list left (scrollable) / summary panel right (fixed).

- Order list: each row has 72px gradient/photo thumb + name + price + stepper (−/qty/+) + line total.
- Previous orders: shown below current order list as read-only round summaries.
- Summary panel: item count heading + subtotal / GST / total lines + note text + "Confirm Order" primary CTA + "Continue Browsing" secondary CTA.
- Empty state: centred message, no cart actions visible until at least 1 item.

### ConfirmationView
**Layout:** Centred single panel on the `--bg` gradient.

- Large `✓` success mark (use brand coral circle, not a raw emoji).
- Eyebrow "Order confirmed" → `h1` "Order sent to the kitchen." → subtext.
- Auto-redirects to WaitingView after 5s. "Go to Table Screen" button skips the wait.
- No header nav visible on this screen.

### WaitingView
**Layout:** Dark status hero (full width) + 3-column waiting grid below.

- Status hero: `--panel-dark` background, white text. Copy left + progress bar right. Progress is static at 40% for now (real kitchen status is a future feature).
- Waiting grid: Service actions panel | Dessert suggestions | Drink suggestions.
- Each suggestion uses `CompactCard` (72px thumb + name + price + `+` button).
- Service actions: "Order More" → MenuView, "View Bill" → BillView.

### ListeningScreen (voice)
- Full-screen dark overlay on top of current view.
- Animated mic pulse ring (`--brand` colour).
- State: idle → listening → processing → done/error.
- Dismiss on tap outside or after 10s silence.

---

## What to Avoid

- Inline `style` for colours, font sizes, or border-radii that have a CSS variable equivalent. Exception: dynamic values (e.g. `style={{ background: heroGradient(item) }}`).
- Duplicating `CATEGORY_GRADIENTS` across files — extract to a shared util in `src/lib/`.
- New screens without the standard `.view` wrapper class.
- Touch targets below 44px (absolute minimum), below 64px (preferred).
- Removing the image fallback gradient before `image_url` is fully seeded.
