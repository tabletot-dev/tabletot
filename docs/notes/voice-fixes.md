# Voice Fixes — Cart Sync, Dynamic IDs, Mic Permission UX

Three fixes shipped in one commit.

## Fix A: Touch cart sync to backend

When the PTT button is pressed, the kiosk sends a `cart_sync` JSON frame to the backend
**before** streaming audio. This lets the LLM know what items are already in the cart
(added via touch), so voice commands like "remove it" or "add one more" work correctly.

### Message structure

Sent by the client immediately after the STT WebSocket opens, before any audio:

```json
{
  "type": "cart_sync",
  "items": [
    { "id": "supabase-uuid", "name": "South Indian Filter Coffee", "qty": 2, "price": 90 },
    { "id": "supabase-uuid", "name": "Belgian Waffle", "qty": 1, "price": 180 }
  ]
}
```

- `id` — Supabase `menu_items.id` UUID (not used by backend; present for client-side tracing)
- `name` — display name; resolved against the menu index to get the petpooja external_id
- `qty` — quantity in kiosk cart
- `price` — unit price in rupees

### Backend handling (`backend/routers/voice.py`)

After `ws.accept()` and before calling `SarvamSTTHandler.transcribe_session()`, the
STT handler waits **500 ms** for a single text frame. If it's a `cart_sync`:

1. `session.orchestrator.order_state.clear()` — wipes any prior voice-only state
2. For each item: `resolve(name, menu_index)` → if `ConfidentMatch`, uses canonical
   `item_id` (petpooja external_id). Falls back to slugified name for unresolvable items.
3. Items are inserted into `order_state` with correct `item_id` so voice `remove_item`
   calls succeed (the orchestrator matches by `item_id`).

If no `cart_sync` arrives within 500 ms (or the first frame is binary audio), the
backend proceeds without syncing. Order state stays as-is from any prior voice turns.

### Client sending (`src/lib/voice/sttClient.ts`)

```ts
// After WS opens, before audio worklet callbacks fire:
if (cartItems && cartItems.length > 0) {
  ws.send(JSON.stringify({ type: "cart_sync", items: cartItems }));
}
```

The send is synchronous on the main thread immediately after `await opened`, so it
always arrives before the first audio chunk (which is queued on the event loop).

---

## Fix B: Dynamic restaurantId and tableId

Previously `VoiceOrderButton` hardcoded `"roast-ccx-hyd"` and `"T-01"`.

### How they now flow

| Source | Value | Used in |
|--------|-------|---------|
| `VITE_RESTAURANT_ID` env var | `cccccccc-cccc-cccc-cccc-cccccccccccc` | `Index.tsx` → `restaurantId` prop |
| Constant `TABLE_ID = "T1"` | `"T1"` (matches `restaurant_tables.table_number`) | `Index.tsx` → `tableId` prop |

`Index.tsx` reads `RESTAURANT_ID` from `import.meta.env.VITE_RESTAURANT_ID` (same var as
the Supabase query filter). `TABLE_ID` is a module-level constant — it's deployment-specific
(one tablet = one table) and does not need to be in env for now.

`VoiceOrderButton` accepts `restaurantId: string` and `tableId: string` as props and passes
them to `startSession(tableId, restaurantId)`.

---

## Fix C: Mic permission denied UX

### Error class (`src/lib/voice/sttClient.ts`)

```ts
export class MicPermissionDeniedError extends Error {
  constructor() {
    super("Microphone access denied by the user or browser settings");
    this.name = "MicPermissionDeniedError";
  }
}
```

`getUserMedia` is now wrapped in try/catch. `NotAllowedError` (browser mic denial) is
rethrown as `MicPermissionDeniedError`. All other errors are re-thrown unchanged.

### UI state (`VoiceOrderButton.tsx`)

```
micBlocked: boolean  (state, default false)
```

`startPress()` catches `MicPermissionDeniedError` specifically, sets `micBlocked = true`,
and resets `pressStatus` to `"idle"`. Touch ordering is **completely unaffected** —
`micBlocked` only controls a banner rendered above the mic button.

### Banner

When `micBlocked = true`, this banner renders above the mic button:

> Microphone needed for voice ordering. Allow mic in browser settings.

The PTT button itself remains visible and in its normal state (it just can't complete
`startSttPress`). Touch path — the entire menu, cart, and checkout flow — is unaffected.

Once the user grants mic permission in browser settings and refreshes, `micBlocked` resets
to `false` on mount and the voice path works normally again.
