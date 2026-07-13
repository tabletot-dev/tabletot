# Ledger Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the distributed session state (sessionStorage + Realtime + triggers) with a single append-only `table_events` ledger and one server-side writer, so any device can be power-cycled at any moment and the system converges.

**Architecture:** One `append_event()` Postgres RPC is the only writer for order/session lifecycle. It maintains the existing tables (`sessions`, `orders`, `kot_tickets`, `restaurant_tables`) internally as projections, so POS/dashboard reads keep working unchanged at every step. The kiosk becomes stateless: on boot/wake it calls `get_table_state()` instead of trusting sessionStorage. Idempotency comes from client-generated `event_id` UUIDs (replays return the stored result). Background: `docs/notes/2026-07-11-ledger-refactor-discussion.md`; bug IDs (C1, H1, …) refer to `docs/notes/2026-07-11-codebase-bug-audit.md`.

**Tech Stack:** Supabase Postgres (PL/pgSQL migrations), supabase-js v2, React 18 + Vite kiosk/POS, vitest.

## Global Constraints

- **Never edit an existing migration.** Migrations currently end at `0046_voice_sessions_table.sql`; this plan creates `0047`–`0050`.
- **Apply migrations to local Supabase (Docker) only** (`supabase db reset` or `supabase migration up`). The user pushes to remote themselves — never run `supabase db push`.
- **After every migration task, regenerate types** for all three apps (exact command in each task) before writing TS against the new schema.
- **THE VOICE PIPELINE IS FROZEN.** Do not modify anything under `apps/kiosk/src/lib/voice/`, `VoiceOrderButton`, `VoiceConversationPanel`, `ListeningScreen`, or `services/order-engine/`.
- Supabase clients use the **publishable key** (never legacy anon_key). Env vars for the kiosk live in `apps/kiosk/.env.local`.
- Pilot restaurant UUID: `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91` (Silver Specialty Coffee).
- Deploys and git pushes are manual — commit locally only.
- Do not edit `apps/kiosk/src/styles/tabletot.css`.
- The old `kiosk_events` table stays (read-only history). Pre-refactor events are not migrated into `table_events`; the pilot has not launched, so no production AOV data is lost.

---

### Task 1: Typecheck in kiosk and POS builds (audit L8)

**Files:**
- Modify: `apps/kiosk/package.json` (scripts block, lines 8–16)
- Modify: `apps/pos/package.json` (scripts block — same pattern)

**Interfaces:**
- Produces: `npm run build` fails on type errors in both apps. Every later task relies on this as its cheapest test.

- [ ] **Step 1: Change the kiosk build script**

In `apps/kiosk/package.json` replace:

```json
    "build": "vite build",
```

with:

```json
    "build": "tsc --noEmit -p tsconfig.app.json && vite build",
```

If `tsconfig.app.json` does not exist in `apps/kiosk/` (check first), use `tsc --noEmit` (bare) instead — it picks up `tsconfig.json`.

- [ ] **Step 2: Same change in `apps/pos/package.json`**

Same replacement, same tsconfig check inside `apps/pos/`.

- [ ] **Step 3: Run both builds; fix only what blocks them**

```bash
cd apps/kiosk && npm run build
cd ../pos && npm run build
```

Expected: **failures are likely** (this is how audit H2 shipped). Fix reported type errors minimally — add missing fields/types, do not restructure. Known offender: `MiniCartSidebar.tsx:35` destructures `isTreatment` from `useRestaurant()` which doesn't exist on `restaurantContext.tsx` — fix by removing the destructure and the dead conditional that uses it (or adding the field if `git log` shows it was intended; prefer removal, it's audit H2 and gets properly rebuilt later).

- [ ] **Step 4: Re-run both builds to green, then commit**

```bash
git add apps/kiosk/package.json apps/pos/package.json <any fixed files>
git commit -m "build: fail kiosk and POS builds on type errors"
```

---

### Task 2: Golden-session test harness

**Files:**
- Create: `apps/kiosk/tests/golden-session.test.ts`
- Modify: `apps/kiosk/package.json` (add script)

**Interfaces:**
- Consumes: local Supabase running (`supabase start`), existing `submit_order` RPC (migration 0044/0045).
- Produces: `npm run test:golden` — a node-environment vitest file that later tasks extend with ledger assertions. Exports nothing; each task appends `it()` blocks to it.

- [ ] **Step 1: Get local keys**

```bash
supabase status
```

Copy the `API URL`, `service_role key`, and `publishable key` values. The test reads them from env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 2: Write the harness with one test against existing behavior**

Create `apps/kiosk/tests/golden-session.test.ts`:

```ts
// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeEach } from 'vitest';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const kiosk = createClient(URL, process.env.SUPABASE_PUBLISHABLE_KEY!);
const RESTAURANT_ID = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

// One table + two menu items, reset before every test.
let table: { id: string; table_number: string };
let items: { id: string; name: string; price: number }[];

beforeEach(async () => {
  const { data: t, error: te } = await admin
    .from('restaurant_tables')
    .select('id, table_number')
    .eq('restaurant_id', RESTAURANT_ID)
    .order('table_number')
    .limit(1)
    .single();
  if (te) throw te;
  table = t;

  const { data: mi, error: me } = await admin
    .from('menu_items')
    .select('id, name, price')
    .eq('restaurant_id', RESTAURANT_ID)
    .limit(2);
  if (me) throw me;
  items = mi!;

  // Wipe state for this table so tests are independent.
  await admin.from('kot_tickets').delete().eq('table_number', table.table_number);
  await admin.from('orders').delete().eq('table_id', table.id);
  await admin.from('sessions').delete().eq('table_id', table.id);
  await admin.from('restaurant_tables')
    .update({ status: 'available', current_order_id: null })
    .eq('id', table.id);
});

function cartRound(qty = 1) {
  return items.map((i) => ({ id: i.id, name: i.name, qty, price: i.price, modifiers: [] }));
}

describe('golden session (pre-ledger baseline)', () => {
  it('submit_order round 1 creates an order with DB-priced subtotal', async () => {
    const sessionKey = crypto.randomUUID();
    await admin.from('sessions').insert({
      restaurant_id: RESTAURANT_ID,
      table_id: table.id,
      table_number: table.table_number,
      session_key: sessionKey,
      status: 'active',
    });

    const { data, error } = await kiosk.rpc('submit_order', {
      p_restaurant_id: RESTAURANT_ID,
      p_table_id: table.id,
      p_table_number: table.table_number,
      p_session_key: sessionKey,
      p_new_items: cartRound(),
      p_existing_order_id: null,
      p_display_name: null,
    });
    expect(error).toBeNull();
    const expectedSubtotal = items.reduce((s, i) => s + Number(i.price), 0);
    expect(Number(data![0].subtotal)).toBeCloseTo(expectedSubtotal, 2);

    const { data: order } = await admin
      .from('orders').select('*').eq('id', data![0].order_id).single();
    expect(order!.status).toBe('new');
  });
});
```

- [ ] **Step 3: Add the script to `apps/kiosk/package.json`**

```json
    "test:golden": "vitest run tests/golden-session.test.ts",
```

- [ ] **Step 4: Run it against local Supabase**

```bash
supabase start   # if not already running
cd apps/kiosk && SUPABASE_SERVICE_ROLE_KEY=<from status> SUPABASE_PUBLISHABLE_KEY=<from status> npm run test:golden
```

Expected: PASS (1 test). If `restaurant_tables` or `menu_items` come back empty, run `supabase db reset` to reapply migrations + seed.

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk/tests/golden-session.test.ts apps/kiosk/package.json
git commit -m "test: golden-session harness against local supabase"
```

---

### Task 3: Migration 0047 — ledger tables + `append_event` core + `get_table_state`

**Files:**
- Create: `supabase/migrations/0047_table_events_ledger.sql`
- Modify: `apps/kiosk/tests/golden-session.test.ts` (append tests)

**Interfaces:**
- Produces (later tasks rely on these exact signatures):
  - `append_event(p_event_id uuid, p_restaurant_id uuid, p_table_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}') RETURNS jsonb` — SECURITY DEFINER, granted to anon+authenticated. Handles `session_started` + pure analytics events in this task; `order_submitted` arrives in Task 4, `bill_requested`/`payment_settled` in Task 5 (until then those types RAISE 'not implemented yet').
  - `get_table_state(p_table_id uuid) RETURNS jsonb` — shape `{ state, span_id, order_id, order, rounds }`.
  - Tables `table_events`, `table_state` (no direct client writes — RPC only).
- State machine: `idle → ordering → bill_requested → idle`. A "span" (= session) is opened by `session_started` (and, from Task 4, implicitly by `order_submitted`) and closed only by `payment_settled`.

- [ ] **Step 1: Write failing tests (append to golden file)**

```ts
describe('ledger core (0047)', () => {
  it('append_event is idempotent by event_id', async () => {
    const eventId = crypto.randomUUID();
    const call = () => kiosk.rpc('append_event', {
      p_event_id: eventId,
      p_restaurant_id: RESTAURANT_ID,
      p_table_id: table.id,
      p_event_type: 'session_started',
      p_payload: {},
    });
    const r1 = await call();
    const r2 = await call();
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(r2.data).toEqual(r1.data); // replay returns stored result
    const { count } = await admin
      .from('table_events').select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    expect(count).toBe(1);
  });

  it('session_started twice does NOT reset the span (audit C3)', async () => {
    const r1 = await kiosk.rpc('append_event', {
      p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
      p_table_id: table.id, p_event_type: 'session_started', p_payload: {},
    });
    const r2 = await kiosk.rpc('append_event', {
      p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
      p_table_id: table.id, p_event_type: 'session_started', p_payload: {},
    });
    expect((r2.data as any).span_id).toBe((r1.data as any).span_id);
    const { data: t } = await admin
      .from('restaurant_tables').select('status').eq('id', table.id).single();
    expect(t!.status).toBe('occupied'); // never flipped back to available
  });

  it('get_table_state reflects the open span', async () => {
    const r = await kiosk.rpc('append_event', {
      p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
      p_table_id: table.id, p_event_type: 'session_started', p_payload: {},
    });
    const { data: state } = await kiosk.rpc('get_table_state', { p_table_id: table.id });
    expect((state as any).state).toBe('ordering');
    expect((state as any).span_id).toBe((r.data as any).span_id);
    expect((state as any).rounds).toEqual([]);
  });
});
```

Also extend the `beforeEach` wipe with (before the sessions delete):

```ts
  await admin.from('table_events').delete().eq('table_id', table.id);
  await admin.from('table_state').delete().eq('table_id', table.id);
```

(This will error until 0047 is applied — that's the failing state.)

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:golden` (with env vars). Expected: FAIL — `relation "table_events" does not exist` / `function append_event does not exist`.

- [ ] **Step 3: Write migration `supabase/migrations/0047_table_events_ledger.sql`**

```sql
-- 0047_table_events_ledger.sql
--
-- Append-only ledger + single-writer RPC. See
-- docs/notes/2026-07-11-ledger-refactor-discussion.md.
-- This migration: tables, session_started, analytics events, get_table_state.
-- order_submitted lands in 0048; bill_requested/payment_settled in 0049.

CREATE TABLE table_events (
  event_id      uuid PRIMARY KEY,           -- client-generated: idempotency key
  restaurant_id uuid NOT NULL,
  table_id      uuid NOT NULL REFERENCES restaurant_tables(id),
  span_id       uuid,                       -- NULL for analytics fired while idle
  seq           bigserial,
  event_type    text NOT NULL CHECK (event_type IN (
    'session_started', 'order_submitted', 'bill_requested', 'payment_settled',
    'item_added', 'item_removed',
    'recommendation_shown', 'recommendation_tapped', 'water_requested'
  )),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,                      -- stored so idempotent replays return it
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX table_events_span_idx ON table_events (span_id, seq);
CREATE INDEX table_events_type_time_idx ON table_events (restaurant_id, event_type, created_at);

CREATE TABLE table_state (
  table_id      uuid PRIMARY KEY REFERENCES restaurant_tables(id),
  restaurant_id uuid NOT NULL,
  span_id       uuid,
  state         text NOT NULL DEFAULT 'idle'
                CHECK (state IN ('idle', 'ordering', 'bill_requested')),
  order_id      uuid,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Single-writer: no direct client access. All writes via append_event().
ALTER TABLE table_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_state  ENABLE ROW LEVEL SECURITY;
-- Kiosk boots by reading state; Realtime "poke" also rides on this table.
CREATE POLICY table_state_read ON table_state FOR SELECT TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE table_state;

CREATE OR REPLACE FUNCTION append_event(
  p_event_id      uuid,
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_event_type    text,
  p_payload       jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state  table_state%ROWTYPE;
  v_span   uuid;
  v_result jsonb;
BEGIN
  -- Idempotent replay: same event_id returns the original result, no re-execution.
  SELECT result INTO v_result FROM table_events WHERE event_id = p_event_id;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  -- Ensure + lock the per-table state row. The FOR UPDATE serializes ALL
  -- events for one table, which is what makes the state machine race-free.
  INSERT INTO table_state (table_id, restaurant_id)
  VALUES (p_table_id, p_restaurant_id)
  ON CONFLICT (table_id) DO NOTHING;

  SELECT * INTO v_state FROM table_state WHERE table_id = p_table_id FOR UPDATE;
  v_span := v_state.span_id;

  IF p_event_type = 'session_started' THEN
    IF v_state.state = 'idle' THEN
      v_span := gen_random_uuid();
      UPDATE table_state
      SET span_id = v_span, state = 'ordering', order_id = NULL, updated_at = now()
      WHERE table_id = p_table_id;

      -- Projection bridge: keep sessions + restaurant_tables in the shapes
      -- POS/dashboard already read. session_key = span_id::text.
      INSERT INTO sessions (restaurant_id, table_id, table_number, session_key, status, display_name)
      SELECT p_restaurant_id, p_table_id, rt.table_number, v_span::text, 'active',
             p_payload->>'display_name'
      FROM restaurant_tables rt WHERE rt.id = p_table_id;

      UPDATE restaurant_tables
      SET status = 'occupied', updated_at = now()
      WHERE id = p_table_id;
    END IF;
    -- Already seated: JOIN the existing span. Never close-and-reopen (audit C3).
    v_result := jsonb_build_object('span_id', v_span, 'state', 'ordering');

  ELSIF p_event_type IN ('item_added', 'item_removed',
                         'recommendation_shown', 'recommendation_tapped',
                         'water_requested') THEN
    -- Pure analytics: no state change. span_id may be NULL when idle
    -- (e.g. recommendation_shown on the home screen).
    v_result := jsonb_build_object('span_id', v_span, 'state', v_state.state);

  ELSE
    -- order_submitted (0048), bill_requested / payment_settled (0049)
    RAISE EXCEPTION 'append_event: % not implemented yet', p_event_type;
  END IF;

  INSERT INTO table_events (event_id, restaurant_id, table_id, span_id, event_type, payload, result)
  VALUES (p_event_id, p_restaurant_id, p_table_id, v_span, p_event_type, p_payload, v_result);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION append_event(uuid, uuid, uuid, text, jsonb) TO anon, authenticated;

-- Everything the kiosk needs to rebuild its UI after boot/wake/reload (audit M5).
CREATE OR REPLACE FUNCTION get_table_state(p_table_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'state',    COALESCE(ts.state, 'idle'),
    'span_id',  ts.span_id,
    'order_id', ts.order_id,
    'order',    (SELECT jsonb_build_object(
                   'items_json', o.items_json,
                   'subtotal',   o.subtotal,
                   'tax',        o.tax,
                   'total',      o.total,
                   'status',     o.status
                 ) FROM orders o WHERE o.id = ts.order_id),
    'rounds',   COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'kot_id',     k.id,
                    'items',      k.items,
                    'status',     k.status,
                    'created_at', k.created_at
                  ) ORDER BY k.created_at)
                  FROM kot_tickets k
                  WHERE k.session_id = ts.span_id::text
                ), '[]'::jsonb)
  )
  FROM (SELECT * FROM table_state WHERE table_id = p_table_id
        UNION ALL SELECT p_table_id, NULL, NULL, 'idle', NULL, now()
        LIMIT 1) ts;
$$;

GRANT EXECUTE ON FUNCTION get_table_state(uuid) TO anon, authenticated;
```

- [ ] **Step 4: Apply locally and regenerate types**

```bash
supabase migration up          # or: supabase db reset
supabase gen types typescript --local > apps/kiosk/src/integrations/supabase/types.ts
supabase gen types typescript --local > apps/pos/src/integrations/supabase/types.ts
supabase gen types typescript --local > apps/dashboard/src/integrations/supabase/types.ts
```

(Confirm each app's types path exists before overwriting; kiosk and dashboard paths are known-good from imports.)

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test:golden`. Expected: PASS (4 tests — baseline + 3 new).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0047_table_events_ledger.sql apps/*/src/integrations/supabase/types.ts apps/kiosk/tests/golden-session.test.ts
git commit -m "feat: table_events ledger, append_event core, get_table_state (0047)"
```

---

### Task 4: Migration 0048 — `order_submitted` handler (port of `submit_order`)

**Files:**
- Create: `supabase/migrations/0048_append_event_order_submitted.sql`
- Modify: `apps/kiosk/tests/golden-session.test.ts` (append tests)

**Interfaces:**
- Consumes: `append_event` from Task 3 (CREATE OR REPLACE — copy the 0047 function body and extend it; never edit 0047 itself).
- Produces: `order_submitted` payload contract used by Tasks 7, 9, 11:
  - payload: `{ "items": [{id, name, qty, price, modifiers}], "display_name": string|null, "source": "kiosk"|"pos" }`
  - result: `{ "order_id": uuid, "kot_id": uuid, "subtotal": numeric, "total": numeric, "span_id": uuid, "state": "ordering" }`
- Round tracking moves server-side: **the existing order id comes from `table_state.order_id`, never from the client** (kills audit C2's "Order not found" and the second-submit half of H5).
- Submitting from `idle` implicitly opens a span (kills audit C1).

- [ ] **Step 1: Write failing tests (append to golden file)**

```ts
describe('order_submitted via ledger (0048)', () => {
  const submit = (eventId: string, qty = 1) => kiosk.rpc('append_event', {
    p_event_id: eventId, p_restaurant_id: RESTAURANT_ID, p_table_id: table.id,
    p_event_type: 'order_submitted',
    p_payload: { items: cartRound(qty), display_name: null, source: 'kiosk' },
  });

  it('submit from idle implicitly opens a span (audit C1)', async () => {
    const { data, error } = await submit(crypto.randomUUID());
    expect(error).toBeNull();
    expect((data as any).order_id).toBeTruthy();
    const { data: st } = await kiosk.rpc('get_table_state', { p_table_id: table.id });
    expect((st as any).state).toBe('ordering');
  });

  it('round 2 merges into the SAME order without a client order id (audit C2)', async () => {
    await submit(crypto.randomUUID(), 1);
    await submit(crypto.randomUUID(), 2);
    const { data: orders } = await admin.from('orders').select('*').eq('table_id', table.id);
    expect(orders!.length).toBe(1); // one order row, two KOTs
    const line = (orders![0].items_json as any[]).find((l) => l.id === items[0].id);
    expect(line.qty).toBe(3); // 1 + 2 merged
    const { data: kots } = await admin
      .from('kot_tickets').select('id').eq('order_id', orders![0].id);
    expect(kots!.length).toBe(2);
  });

  it('replaying the same submit event does NOT create a second order (audit H5/H1)', async () => {
    const eventId = crypto.randomUUID();
    await submit(eventId);
    await submit(eventId); // double-tap / retry
    const { data: orders } = await admin.from('orders').select('id').eq('table_id', table.id);
    expect(orders!.length).toBe(1);
    const { data: kots } = await admin
      .from('kot_tickets').select('id').eq('order_id', orders![0].id);
    expect(kots!.length).toBe(1); // kitchen got ONE ticket
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:golden`. Expected: FAIL with `append_event: order_submitted not implemented yet`.

- [ ] **Step 3: Write migration `0048_append_event_order_submitted.sql`**

`CREATE OR REPLACE FUNCTION append_event(...)` with the full 0047 body, replacing the final `ELSE RAISE` branch. New branch, inserted before the ELSE (declare the extra variables in DECLARE: `v_items jsonb; v_new_subtotal numeric; v_new_tax numeric; v_new_total numeric; v_order_id uuid; v_kot_id uuid; v_existing_items jsonb; v_existing_subtotal numeric; v_merged_items jsonb; v_merged_subtotal numeric;`):

```sql
  ELSIF p_event_type = 'order_submitted' THEN
    IF v_state.state = 'bill_requested' THEN
      RAISE EXCEPTION 'Bill has been requested — ordering is closed for this table.';
    END IF;

    -- Implicit span open: a customer who tapped a hero dish and never hit
    -- "Start Ordering" must still be able to submit (audit C1).
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      v_span := gen_random_uuid();
      UPDATE table_state
      SET span_id = v_span, state = 'ordering', order_id = NULL, updated_at = now()
      WHERE table_id = p_table_id;
      INSERT INTO sessions (restaurant_id, table_id, table_number, session_key, status, display_name)
      SELECT p_restaurant_id, p_table_id, rt.table_number, v_span::text, 'active',
             p_payload->>'display_name'
      FROM restaurant_tables rt WHERE rt.id = p_table_id;
      UPDATE restaurant_tables SET status = 'occupied', updated_at = now()
      WHERE id = p_table_id;
      -- refresh local copy so order merge below sees the new span
      SELECT * INTO v_state FROM table_state WHERE table_id = p_table_id;
    END IF;

    v_items := p_payload->'items';
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
      RAISE EXCEPTION 'order_submitted requires a non-empty items array.';
    END IF;

    -- Canonical subtotal from DB prices (same rule as 0044).
    SELECT COALESCE(SUM(
      (elem->>'qty')::int *
      COALESCE(
        (SELECT mi.price FROM menu_items mi WHERE mi.id = (elem->>'id')::uuid LIMIT 1),
        (elem->>'price')::numeric
      )
    ), 0)
    INTO v_new_subtotal
    FROM jsonb_array_elements(v_items) AS elem;

    v_new_tax   := ROUND(v_new_subtotal * 0.05, 2);
    v_new_total := v_new_subtotal + v_new_tax;

    IF v_state.order_id IS NOT NULL THEN
      -- Round 2+: merge (identical logic to 0044's merge, keyed by server-held order id)
      SELECT items_json, subtotal INTO v_existing_items, v_existing_subtotal
      FROM orders WHERE id = v_state.order_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', v_state.order_id;
      END IF;

      SELECT jsonb_agg(jsonb_build_object(
        'id', item_id, 'name', item_name, 'qty', item_qty,
        'price', item_price, 'modifiers', item_modifiers))
      INTO v_merged_items
      FROM (
        SELECT
          elem->>'id'                                                 AS item_id,
          (array_agg(elem->>'name'             ORDER BY rn DESC))[1] AS item_name,
          (array_agg((elem->>'price')::numeric ORDER BY rn DESC))[1] AS item_price,
          (array_agg(elem->'modifiers'         ORDER BY rn DESC))[1] AS item_modifiers,
          SUM((elem->>'qty')::int)                                    AS item_qty
        FROM (
          SELECT elem, ordinality AS rn
          FROM jsonb_array_elements(COALESCE(v_existing_items, '[]'::jsonb) || v_items)
               WITH ORDINALITY AS t(elem, ordinality)
        ) sub
        GROUP BY elem->>'id'
      ) merged;

      v_merged_subtotal := COALESCE(v_existing_subtotal, 0) + v_new_subtotal;

      UPDATE orders SET
        items_json = v_merged_items,
        subtotal   = v_merged_subtotal,
        tax        = ROUND(v_merged_subtotal * 0.05, 2),
        total      = v_merged_subtotal + ROUND(v_merged_subtotal * 0.05, 2),
        updated_at = now()
      WHERE id = v_state.order_id;
      v_order_id := v_state.order_id;

    ELSE
      INSERT INTO orders (restaurant_id, table_no, table_id, order_type, source,
                          status, items_json, subtotal, tax, total, session_id)
      SELECT p_restaurant_id, rt.table_number, p_table_id, 'dine-in',
             COALESCE(p_payload->>'source', 'Tabletot'), 'new',
             v_items, v_new_subtotal, v_new_tax, v_new_total, v_span::text
      FROM restaurant_tables rt WHERE rt.id = p_table_id
      RETURNING id INTO v_order_id;

      UPDATE table_state SET order_id = v_order_id, updated_at = now()
      WHERE table_id = p_table_id;
    END IF;

    INSERT INTO kot_tickets (restaurant_id, order_id, kot_number, table_number,
                             items, status, session_id, display_name)
    SELECT p_restaurant_id, v_order_id, 'KOT-' || gen_random_uuid()::text,
           rt.table_number, v_items, 'accepted', v_span::text, p_payload->>'display_name'
    FROM restaurant_tables rt WHERE rt.id = p_table_id
    RETURNING id INTO v_kot_id;

    v_result := jsonb_build_object(
      'order_id', v_order_id, 'kot_id', v_kot_id,
      'subtotal', v_new_subtotal, 'total', v_new_total,
      'span_id', v_span, 'state', 'ordering');
```

Header comment for the migration file: `-- 0048: adds order_submitted to append_event. Round identity now lives in table_state.order_id (server-side), payload/result contract documented in docs/plans/2026-07-12-ledger-refactor.md Task 4.`

- [ ] **Step 4: Apply, regen types, run tests**

```bash
supabase migration up
supabase gen types typescript --local > apps/kiosk/src/integrations/supabase/types.ts
supabase gen types typescript --local > apps/pos/src/integrations/supabase/types.ts
supabase gen types typescript --local > apps/dashboard/src/integrations/supabase/types.ts
cd apps/kiosk && npm run test:golden
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0048_append_event_order_submitted.sql apps/*/src/integrations/supabase/types.ts apps/kiosk/tests/golden-session.test.ts
git commit -m "feat: order_submitted through the ledger with server-held round identity (0048)"
```

---

### Task 5: Migration 0049 — `bill_requested` + `payment_settled`; retire the 0019 trigger

**Files:**
- Create: `supabase/migrations/0049_append_event_settle.sql`
- Modify: `apps/kiosk/tests/golden-session.test.ts` (append tests)

**Interfaces:**
- Consumes: `append_event` from 0048 (again CREATE OR REPLACE with full body + new branches).
- Produces contracts used by Tasks 9, 10:
  - `bill_requested`: payload `{}`, result `{ "span_id", "state": "bill_requested" }`. From `idle` → RAISE `'No active session.'`
  - `payment_settled`: payload `{ "payment_method": "cash"|"card"|"upi", "amount_paid": number, "tips": number, "created_by": uuid|null }`, result `{ "span_id", "state": "idle", "settled_span_id": uuid, "archived_order_id": uuid|null }`. Archives orders → `order_history`, inserts `payments`, deletes the live order row, closes the sessions row, frees the table, resets `table_state`. From `idle` → RAISE `'No active session.'`
- Drops trigger `free_table_on_session_close` (from migration 0019) — table freeing is now the settle handler's job, so a closed session row can never flip the table under a live customer (audit C3's mechanism).

- [ ] **Step 1: Write failing tests (append to golden file)**

```ts
describe('bill + settle via ledger (0049)', () => {
  const append = (type: string, payload: object = {}) => kiosk.rpc('append_event', {
    p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
    p_table_id: table.id, p_event_type: type, p_payload: payload,
  });

  it('bill_requested blocks further ordering', async () => {
    await append('order_submitted', { items: cartRound(), source: 'kiosk' });
    await append('bill_requested');
    const { error } = await append('order_submitted', { items: cartRound(), source: 'kiosk' });
    expect(error!.message).toContain('ordering is closed');
  });

  it('payment_settled archives, frees the table, resets state', async () => {
    const { data: sub } = await append('order_submitted', { items: cartRound(), source: 'kiosk' });
    await append('bill_requested');
    const { error } = await append('payment_settled',
      { payment_method: 'cash', amount_paid: 100, tips: 0, created_by: null });
    expect(error).toBeNull();

    const { data: live } = await admin.from('orders').select('id').eq('table_id', table.id);
    expect(live!.length).toBe(0);
    const { data: hist } = await admin.from('order_history')
      .select('original_order_id').eq('original_order_id', (sub as any).order_id);
    expect(hist!.length).toBe(1);
    const { data: t } = await admin
      .from('restaurant_tables').select('status').eq('id', table.id).single();
    expect(t!.status).toBe('available');
    const { data: st } = await kiosk.rpc('get_table_state', { p_table_id: table.id });
    expect((st as any).state).toBe('idle');
  });

  it('full golden journey: seat → 2 rounds → bill → settle', async () => {
    await append('session_started');
    await append('order_submitted', { items: cartRound(1), source: 'kiosk' });
    await append('item_added', { itemId: items[0].id, source: 'pairing_chip' });
    await append('order_submitted', { items: cartRound(1), source: 'kiosk' });
    await append('bill_requested');
    const { error } = await append('payment_settled',
      { payment_method: 'upi', amount_paid: 500, tips: 0, created_by: null });
    expect(error).toBeNull();
    // Next customer starts clean:
    const { data: st } = await kiosk.rpc('get_table_state', { p_table_id: table.id });
    expect((st as any).state).toBe('idle');
    expect((st as any).order_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:golden`. Expected: FAIL `bill_requested not implemented yet`.

- [ ] **Step 3: Write migration `0049_append_event_settle.sql`**

CREATE OR REPLACE `append_event` (full body from 0048) with two new branches before the final ELSE (add to DECLARE: `v_order orders%ROWTYPE;`):

```sql
  ELSIF p_event_type = 'bill_requested' THEN
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      RAISE EXCEPTION 'No active session.';
    END IF;
    UPDATE table_state SET state = 'bill_requested', updated_at = now()
    WHERE table_id = p_table_id;
    UPDATE sessions SET status = 'bill_requested'
    WHERE session_key = v_span::text AND status = 'active';
    v_result := jsonb_build_object('span_id', v_span, 'state', 'bill_requested');

  ELSIF p_event_type = 'payment_settled' THEN
    IF v_state.state = 'idle' OR v_span IS NULL THEN
      RAISE EXCEPTION 'No active session.';
    END IF;

    IF v_state.order_id IS NOT NULL THEN
      SELECT * INTO v_order FROM orders WHERE id = v_state.order_id FOR UPDATE;
      IF FOUND THEN
        INSERT INTO order_history (
          original_order_id, order_id, order_type, table_no, customer_name,
          items_json, subtotal, tax, discount, total, special_instructions,
          source, payment_method, amount_paid, tips, created_by, order_created_at
        ) VALUES (
          v_order.id, v_order.order_id, v_order.order_type, v_order.table_no,
          v_order.customer_name, v_order.items_json, v_order.subtotal, v_order.tax,
          v_order.discount, v_order.total, v_order.special_instructions, v_order.source,
          p_payload->>'payment_method',
          (p_payload->>'amount_paid')::numeric,
          COALESCE((p_payload->>'tips')::numeric, 0),
          NULLIF(p_payload->>'created_by', '')::uuid,
          v_order.created_at
        );
        INSERT INTO payments (order_id, payment_method, amount, tips, status, created_by)
        VALUES (v_order.id, p_payload->>'payment_method',
                (p_payload->>'amount_paid')::numeric,
                COALESCE((p_payload->>'tips')::numeric, 0), 'completed',
                NULLIF(p_payload->>'created_by', '')::uuid);
        DELETE FROM orders WHERE id = v_order.id;
      END IF;
    END IF;

    UPDATE sessions
    SET status = 'closed', ended_at = now(), display_name = NULL
    WHERE session_key = v_span::text AND status IN ('active', 'bill_requested');

    UPDATE restaurant_tables
    SET status = 'available', current_order_id = NULL, updated_at = now()
    WHERE id = p_table_id;

    UPDATE table_state
    SET state = 'idle', span_id = NULL, order_id = NULL, updated_at = now()
    WHERE table_id = p_table_id;

    v_result := jsonb_build_object(
      'span_id', NULL, 'state', 'idle',
      'settled_span_id', v_span, 'archived_order_id', v_state.order_id);
```

Then, at the end of the migration file:

```sql
-- Table freeing is now owned by the payment_settled handler. The 0019 trigger
-- fired on ANY session close and could flip the table under a brand-new
-- customer (audit C3). Confirm the exact trigger name before dropping:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'sessions'::regclass;
DROP TRIGGER IF EXISTS free_table_on_session_close ON sessions;
```

(If the name in migration 0019 differs, use the name found there — read `supabase/migrations/0019*.sql` first.)

- [ ] **Step 4: Apply, regen types (same 3 commands as Task 4), run tests**

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0049_append_event_settle.sql apps/*/src/integrations/supabase/types.ts apps/kiosk/tests/golden-session.test.ts
git commit -m "feat: bill_requested/payment_settled via ledger; retire 0019 trigger (0049)"
```

---

### Task 6: Kiosk ledger client (`ledger.ts`)

**Files:**
- Create: `apps/kiosk/src/lib/ledger.ts`
- Test: `apps/kiosk/src/lib/__tests__/ledger.test.ts`

**Interfaces:**
- Consumes: `append_event` / `get_table_state` RPCs (Tasks 3–5), `resolveTableId()` from `@/lib/orderSubmission`, `RESTAURANT_ID` from `@/lib/config`, `supabase`/`hasSupabaseConfig` from `@/integrations/supabase/client`.
- Produces (Tasks 7–9 import these exactly):
  - `appendEvent(eventType: LedgerEventType, payload?: Json, eventId?: string): Promise<Json>`
  - `getTableState(): Promise<TableState>`
  - `subscribeTableState(onChange: () => void): () => void` — returns unsubscribe
  - `type TableState = { state: 'idle' | 'ordering' | 'bill_requested'; span_id: string | null; order_id: string | null; order: { items_json: CartLine[]; subtotal: number; tax: number; total: number; status: string } | null; rounds: { kot_id: string; items: CartLine[]; status: string; created_at: string }[] }`
  - `type CartLine = { id: string; name: string; qty: number; price: number; modifiers: string[] }`

- [ ] **Step 1: Write the module**

```ts
import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { RESTAURANT_ID } from '@/lib/config';
import { resolveTableId } from '@/lib/orderSubmission';

export type LedgerEventType =
  | 'session_started'
  | 'order_submitted'
  | 'bill_requested'
  | 'payment_settled'
  | 'item_added'
  | 'item_removed'
  | 'recommendation_shown'
  | 'recommendation_tapped'
  | 'water_requested';

export type CartLine = {
  id: string; name: string; qty: number; price: number; modifiers: string[];
};

export type TableState = {
  state: 'idle' | 'ordering' | 'bill_requested';
  span_id: string | null;
  order_id: string | null;
  order: { items_json: CartLine[]; subtotal: number; tax: number; total: number; status: string } | null;
  rounds: { kot_id: string; items: CartLine[]; status: string; created_at: string }[];
};

// The eventId is the idempotency key: callers that might retry (order submit)
// generate it ONCE and reuse it across attempts.
export async function appendEvent(
  eventType: LedgerEventType,
  payload: Json = {},
  eventId: string = crypto.randomUUID(),
): Promise<Json> {
  if (!hasSupabaseConfig) return {};
  const tableId = await resolveTableId();
  const { data, error } = await supabase.rpc('append_event', {
    p_event_id: eventId,
    p_restaurant_id: RESTAURANT_ID,
    p_table_id: tableId,
    p_event_type: eventType,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function getTableState(): Promise<TableState> {
  const tableId = await resolveTableId();
  const { data, error } = await supabase.rpc('get_table_state', { p_table_id: tableId });
  if (error) throw error;
  return data as unknown as TableState;
}

// Realtime is a poke, not a state transport: any change to our table_state row
// means "refetch". A missed poke costs one stale render, never a wrong state.
export function subscribeTableState(onChange: () => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;
  resolveTableId().then((tableId) => {
    if (cancelled) return;
    channel = supabase
      .channel(`table-state-${tableId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'table_state', filter: `table_id=eq.${tableId}` },
        onChange)
      .subscribe();
  }).catch(() => {});
  return () => {
    cancelled = true;
    if (channel) supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 2: Write a unit test for the idempotency-key contract**

`apps/kiosk/src/lib/__tests__/ledger.test.ts` (mock supabase; follow the mocking pattern of any existing test under `src/lib/__tests__/` — check first with `ls`):

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) },
}));
vi.mock('@/lib/orderSubmission', () => ({
  resolveTableId: vi.fn(async () => 'table-uuid'),
}));

import { appendEvent } from '@/lib/ledger';
import { supabase } from '@/integrations/supabase/client';

describe('appendEvent', () => {
  it('passes the caller-supplied eventId through unchanged (idempotency contract)', async () => {
    await appendEvent('order_submitted', { items: [] }, 'fixed-id');
    const args = (supabase.rpc as any).mock.calls[0];
    expect(args[0]).toBe('append_event');
    expect(args[1].p_event_id).toBe('fixed-id');
  });
});
```

- [ ] **Step 3: Run** `cd apps/kiosk && npx vitest run src/lib/__tests__/ledger.test.ts` — expected PASS — then `npm run build` (typecheck).

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk/src/lib/ledger.ts apps/kiosk/src/lib/__tests__/ledger.test.ts
git commit -m "feat(kiosk): ledger client - appendEvent, getTableState, subscribeTableState"
```

---

### Task 7: Kiosk submit + session start through the ledger

**Files:**
- Modify: `apps/kiosk/src/lib/orderSubmission.ts`

**Interfaces:**
- Consumes: `appendEvent` from Task 6.
- Produces (existing callers keep working — same names):
  - `submitOrder(cart: OrderItem[]): Promise<{ orderId: string; kotId: string }>` — same signature as today; internally one `appendEvent('order_submitted', …)` with a per-attempt-stable `event_id`.
  - `startSession(displayName?: string): Promise<void>` — internally `appendEvent('session_started', …)`.
  - `OrderSubmissionError` unchanged.
  - **Deleted:** `getSessionKey`, `getActiveOrderId`, `setActiveOrderId`, the sessionStorage keys `tt_session_id` and `tt_order_id`, and the "close stale sessions" block. `clearSession()` becomes sessionStorage-only (identity/display-name); it must NOT touch the `sessions` table.
  - Kept as-is: `resolveTableId`, `getDisplayName`, `isIdentityResolved`, `markIdentityResolved`.

- [ ] **Step 1: Rewrite `startSession`**

```ts
export async function startSession(displayName?: string): Promise<void> {
  if (displayName) sessionStorage.setItem('tt_display_name', displayName);
  if (!hasSupabaseConfig) return;
  try {
    await appendEvent('session_started', { display_name: displayName ?? null });
  } catch (err) {
    // Non-blocking: order_submitted implicitly opens the span anyway.
    console.warn('session_started failed (non-blocking):', err);
  }
}
```

- [ ] **Step 2: Rewrite `submitOrder`**

```ts
export async function submitOrder(
  cart: OrderItem[],
): Promise<{ orderId: string; kotId: string }> {
  const items = cart.map((item) => ({
    id: item.id, name: item.name, qty: item.quantity,
    price: item.price, modifiers: [] as string[],
  }));

  // One event_id per submit attempt-group: a retry of THIS submission reuses
  // the id, so the kitchen can never receive the round twice.
  const eventId = crypto.randomUUID();
  let data: Json;
  try {
    data = await appendEvent('order_submitted',
      { items, display_name: getDisplayName(), source: 'kiosk' } as unknown as Json,
      eventId);
  } catch (error) {
    const msg = (error as Error).message ?? '';
    if (msg.includes('ordering is closed')) throw new OrderSubmissionError('session', msg);
    if (msg.includes('not found')) throw new OrderSubmissionError('order', msg);
    throw new OrderSubmissionError('kot', msg);
  }

  const result = data as unknown as { order_id: string; kot_id: string; total: number };
  return { orderId: result.order_id, kotId: result.kot_id };
}
```

Note: the old `track('order_submitted', …)` call is **removed** — the submit IS the event now. Keep `setSessionDisplayName` but change its DB update to match by the current span: replace the `session_key` lookup from sessionStorage with `getTableState()` → `span_id`, i.e. `.eq('session_key', state.span_id)` and skip when `span_id` is null. Import `getTableState` from `@/lib/ledger`.

- [ ] **Step 3: Rewrite `clearSession` (UI-only)**

```ts
export async function clearSession(): Promise<void> {
  sessionStorage.removeItem('tt_display_name');
  sessionStorage.removeItem('tt_identity_resolved');
  cachedTableId = null;
  // Server state is owned by the ledger: only payment_settled closes a span.
}
```

- [ ] **Step 4: Typecheck + tests**

```bash
cd apps/kiosk && npm run build && npm run test
```

Expected: build PASS; if `npm run test` reveals tests asserting the deleted sessionStorage behavior, update them to assert the new contract (submitOrder resolves with orderId/kotId; no `tt_session_id` writes).

- [ ] **Step 5: Manual smoke via golden test** — `npm run test:golden` still PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/src/lib/orderSubmission.ts <updated tests>
git commit -m "refactor(kiosk): submit and session start through the ledger; drop client session keys"
```

---

### Task 8: Kiosk analytics through the ledger; delete the retry queue

**Files:**
- Modify: `apps/kiosk/src/lib/eventBus.ts`

**Interfaces:**
- Consumes: `appendEvent` from Task 6.
- Produces: `track()` keeps its exact public signature and `EventMap`/`Source`/`Surface` types (callers untouched), minus the `order_submitted` entry in `EventMap` (that event now goes through `submitOrder` only — remove it from the map; Task 7 already removed the only caller).
- **Deleted:** the entire localStorage retry queue (`QUEUE_KEY`, `QUEUE_MAX`, `PendingEvent`, `readQueue`, `writeQueue`, `drainQueue`, `insertWithRetry`) and all `kiosk_events` inserts.

- [ ] **Step 1: Rewrite the file body**

Keep the type declarations (`Surface`, `Source`, `EventMap` without `order_submitted`), then:

```ts
import { appendEvent } from '@/lib/ledger';
import type { Json } from '@/integrations/supabase/types';
import { hasSupabaseConfig } from '@/integrations/supabase/client';

// Analytics are fire-and-forget appends to the ledger. Loss is acceptable and
// only ever UNDER-counts recommendations (never inflates AOV — audit H1).
// The AOV-critical order_submitted event is not tracked here; the order
// submission itself IS that event (see orderSubmission.submitOrder).
export function track<E extends keyof EventMap>(
  eventType: E,
  payload: EventMap[E],
): void {
  if (!hasSupabaseConfig) return;
  appendEvent(eventType, payload as unknown as Json).catch((err) =>
    console.error('[track]', eventType, err),
  );
}
```

- [ ] **Step 2: Typecheck + fix fallout**

```bash
cd apps/kiosk && npm run build
```

Expected: errors where callers pass `order_submitted` to `track` (should be none after Task 7) or import removed helpers. Fix by deletion.

- [ ] **Step 3: Golden check** — extend nothing; run `npm run test:golden` (PASS 10) and `npm run test` (PASS).

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk/src/lib/eventBus.ts
git commit -m "refactor(kiosk): analytics ride the ledger; delete localStorage retry queue"
```

---

### Task 9: Kiosk boot hydration + table_state Realtime + completion-skip guard

**Files:**
- Modify: `apps/kiosk/src/pages/Index.tsx`
- Modify: `apps/kiosk/src/hooks/useDeviceNavigation.ts` (read it fully first — it owns `previousOrders`, `confirmOrder`, `endSession`)
- Modify: `apps/kiosk/src/components/screens/BillView.tsx` (bill request → ledger)

**Interfaces:**
- Consumes: `getTableState`, `subscribeTableState`, `appendEvent`, `TableState` from Task 6.
- Produces: the kiosk survives reload/sleep with full order history on screen (audit M5); the payment-confirmed overlay only fires for a settle of the span this device knows about (audit C3); completion-nudge "skip" goes through the guarded submit path (audit H5).

- [ ] **Step 1: Boot hydration**

In `Index.tsx`, extend the mount effect at lines 71–74. After `resolveTableId()`, call `getTableState()`. If `state !== 'idle'` and `rounds.length > 0`: hydrate `previousOrders` from `rounds` (add a `hydrateFromTableState(state: TableState)` setter to `useDeviceNavigation` that maps each round's `items` to the hook's round shape and sets `currentRoundOrderId` from `state.order_id`) and set the screen to `"session-idle"`. Match the hook's existing round type exactly — read it before writing the mapper.

- [ ] **Step 2: Replace the `restaurant_tables` Realtime subscription (lines 89–117)**

```tsx
// The ledger's table_state row is the single truth. Any change → refetch.
// The settle overlay fires only when OUR known span settles (audit C3).
const spanIdRef = useRef<string | null>(null);
useEffect(() => {
  if (!tableUuid) return;
  const refetch = async () => {
    try {
      const st = await getTableState();
      if (st.state === 'idle' && spanIdRef.current !== null && currentScreenRef.current !== 'idle') {
        setPaymentConfirmed(true);
        window.setTimeout(() => {
          setPaymentConfirmed(false);
          handleEndSession();
          setVoiceTurns([]);
        }, 3000);
      }
      spanIdRef.current = st.span_id;
    } catch { /* next poke retries */ }
  };
  refetch();
  const unsubscribe = subscribeTableState(refetch);
  return unsubscribe;
}, [tableUuid, handleEndSession]);
```

Remove the old `supabase.channel('table-status-…')` block and the now-unused `supabase` import if nothing else in the file uses it.

- [ ] **Step 3: Completion-skip guard (audit H5 second half)**

Replace lines 275–278:

```tsx
const handleCompletionSkip = useCallback(async () => {
  setCompletionSuggestion(null);
  if (isSubmitting) return;
  setIsSubmitting(true);
  try {
    await confirmOrder();
  } finally {
    setIsSubmitting(false);
  }
}, [confirmOrder, isSubmitting]);
```

- [ ] **Step 4: BillView requests the bill through the ledger**

In `BillView.tsx`, where the bill request is submitted (`submitBillRequest`, around lines 60–64): call `await appendEvent('bill_requested')` before the existing `bill_requests` insert, and **surface failures** — on error show an error message instead of "Bill coming your way" (audit M2). Keep the existing phone-capture insert as-is.

- [ ] **Step 5: Typecheck, unit tests, golden**

```bash
cd apps/kiosk && npm run build && npm run test && npm run test:golden
```

Expected: all PASS.

- [ ] **Step 6: Manual verification on device/browser (use the `verify` skill if executing interactively)**

Local run (`npm run dev`, port 8080): start a session, submit a round, hard-reload the page → WaitingView shows the submitted round (M5 fixed). Then settle from POS (or via `append_event('payment_settled', …)` in SQL editor) → kiosk shows Payment Confirmed and resets.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/src/pages/Index.tsx apps/kiosk/src/hooks/useDeviceNavigation.ts apps/kiosk/src/components/screens/BillView.tsx
git commit -m "refactor(kiosk): boot from table_state, span-aware settle overlay, guarded completion skip"
```

---

### Task 10: POS settle through the ledger

**Files:**
- Modify: `apps/pos/src/components/billing/PaymentModal.tsx:38-139`

**Interfaces:**
- Consumes: `payment_settled` contract from Task 5. POS calls `supabase.rpc('append_event', …)` directly (no shared package yet — `packages/` is empty; a 10-line inline call beats a new package).
- Produces: `handlePayment` = one RPC call; the archive/payments/table-free/delete block (lines 50–126) is deleted. Includes the NaN guard (audit M7).

- [ ] **Step 1: Rewrite `handlePayment`**

```tsx
const handlePayment = async () => {
  const paid = parseFloat(amountPaid);
  if (!Number.isFinite(paid) || paid < total) {
    toast({
      title: 'Insufficient amount',
      description: 'Payment amount must be at least the total',
      variant: 'destructive',
    });
    return;
  }

  setLoading(true);
  try {
    const { error } = await supabase.rpc('append_event', {
      p_event_id: crypto.randomUUID(),
      p_restaurant_id: RESTAURANT_ID,
      p_table_id: tableId!,
      p_event_type: 'payment_settled',
      p_payload: {
        payment_method: paymentMethod,
        amount_paid: paid,
        tips: parseFloat(tips || '0') || 0,
        created_by: user?.id ?? null,
      },
    });
    if (error) throw error;

    toast({
      title: 'Payment successful',
      description: `Order completed. ${change > 0 ? `Change: ₹${change.toFixed(2)}` : ''}`,
    });
    onComplete();
  } catch (error: any) {
    toast({ title: 'Error', description: error.message, variant: 'destructive' });
  } finally {
    setLoading(false);
  }
};
```

`RESTAURANT_ID`: check how other POS pages scope by restaurant (grep `restaurant_id` under `apps/pos/src`) and use the same source; if POS has no central constant, thread it in as a prop from the caller that already knows the table. `tableId` may be undefined in the props type — settling without a table is no longer meaningful; if `!tableId`, show a destructive toast `'No table linked to this order'` and return.

- [ ] **Step 2: Typecheck + build POS** — `cd apps/pos && npm run build`. Expected PASS.

- [ ] **Step 3: Golden regression** — `npm run test:golden` in `apps/kiosk` (the settle path it asserts is the same RPC POS now calls). Expected PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/pos/src/components/billing/PaymentModal.tsx
git commit -m "refactor(pos): settle via payment_settled ledger event; NaN amount guard"
```

---

### Task 11: POS "Add Items" through the ledger (audit M4)

**Files:**
- Modify: `apps/pos/src/pages/Billing.tsx` (the add-items write, audit cites lines 352–387 — read the whole handler first)

**Interfaces:**
- Consumes: `order_submitted` contract from Task 4 with `source: 'pos'`.
- Produces: POS-added items reach `orders.items_json` in the canonical `{id, name, qty, price, modifiers}` shape via the same merge path as kiosk rounds — no more `{quantity, total}`-shaped entries or tax-free `total` overwrites.

- [ ] **Step 1: Replace the direct `orders` update**

Where `Billing.tsx` currently appends POS-shaped items to `items_json` and writes `total = subtotal`, replace the whole write with:

```tsx
const { error } = await supabase.rpc('append_event', {
  p_event_id: crypto.randomUUID(),
  p_restaurant_id: RESTAURANT_ID,     // same source as Task 10
  p_table_id: tableId,                // the table whose order is being amended
  p_event_type: 'order_submitted',
  p_payload: {
    items: addedItems.map((it) => ({
      id: it.id,
      name: it.name,
      qty: it.quantity,               // POS local shape → canonical qty
      price: it.price,
      modifiers: [],
    })),
    display_name: null,
    source: 'pos',
  },
});
if (error) throw error;
```

Adapt `addedItems`/`it.quantity` to the real local variable names found in the file. Delete the manual `items_json` concat and the `total = subtotal` write — the RPC computes tax-inclusive totals from DB prices.

Note the behavior change: POS add-items now also cuts a KOT for the kitchen (it's a new round). That is correct — today those items never reach the kitchen ticket flow at all.

- [ ] **Step 2: Build + golden** — `cd apps/pos && npm run build`; kiosk `npm run test:golden`. Expected PASS. Add one golden test:

```ts
it('POS add-items merges in canonical shape (audit M4)', async () => {
  await kiosk.rpc('append_event', {
    p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
    p_table_id: table.id, p_event_type: 'order_submitted',
    p_payload: { items: cartRound(1), source: 'kiosk' },
  });
  await kiosk.rpc('append_event', {
    p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
    p_table_id: table.id, p_event_type: 'order_submitted',
    p_payload: { items: [{ id: items[0].id, name: items[0].name, qty: 1, price: items[0].price, modifiers: [] }], source: 'pos' },
  });
  const { data: orders } = await admin.from('orders').select('*').eq('table_id', table.id);
  expect(orders!.length).toBe(1);
  for (const line of orders![0].items_json as any[]) {
    expect(typeof line.qty).toBe('number'); // never null (M4)
  }
  expect(Number(orders![0].total)).toBeGreaterThan(Number(orders![0].subtotal)); // tax included
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/pos/src/pages/Billing.tsx apps/kiosk/tests/golden-session.test.ts
git commit -m "refactor(pos): add-items as an order_submitted ledger round (fixes M4)"
```

---

### Task 12: Migration 0050 — `get_aov_summary` v4 over the ledger (audit H1)

**Files:**
- Create: `supabase/migrations/0050_get_aov_summary_v4.sql`
- Modify: `apps/kiosk/tests/golden-session.test.ts` (append test)

**Interfaces:**
- Consumes: `table_events` rows written by Tasks 3–5.
- Produces: same signature and return shape as v3 (`get_aov_summary(p_restaurant_id uuid, p_start_at timestamptz, p_end_at timestamptz) RETURNS TABLE(accepted_count bigint, direct_revenue numeric, accepted_items jsonb, total_revenue numeric, session_count bigint)`) so `apps/dashboard/src/pages/AovView.tsx` needs **no changes**.

- [ ] **Step 1: Write the failing test**

```ts
describe('AOV v4 (0050)', () => {
  it('multi-round session counts each accepted recommendation ONCE (audit H1)', async () => {
    const append = (type: string, payload: object = {}) => kiosk.rpc('append_event', {
      p_event_id: crypto.randomUUID(), p_restaurant_id: RESTAURANT_ID,
      p_table_id: table.id, p_event_type: type, p_payload: payload,
    });
    await append('session_started');
    await append('item_added', { itemId: items[0].id, source: 'pairing_chip' });
    await append('order_submitted', { items: cartRound(1), source: 'kiosk' }); // round 1
    await append('order_submitted', { items: cartRound(1), source: 'kiosk' }); // round 2
    await append('bill_requested');
    await append('payment_settled', { payment_method: 'cash', amount_paid: 500, tips: 0, created_by: null });

    const { data, error } = await admin.rpc('get_aov_summary', {
      p_restaurant_id: RESTAURANT_ID,
      p_start_at: new Date(Date.now() - 60_000).toISOString(),
      p_end_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).toBeNull();
    expect(Number(data![0].accepted_count)).toBe(1); // v3 would say 2
    expect(Number(data![0].direct_revenue)).toBeCloseTo(Number(items[0].price), 2);
  });
});
```

Run: `npm run test:golden`. Expected: FAIL (v3 reads `kiosk_events`, which the kiosk no longer writes → `accepted_count` 0, or 2 if stale data — either way not 1).

- [ ] **Step 2: Write migration `0050_get_aov_summary_v4.sql`**

```sql
-- 0050_get_aov_summary_v4.sql
-- v4: reads table_events (the ledger) instead of kiosk_events.
-- Fixes audit H1: one row per SPAN (not per order_submitted event), so
-- multi-round sessions and retried submits can no longer multiply
-- accepted_count / direct_revenue. Same signature/shape as v3 — the
-- dashboard AovView needs no changes.

CREATE OR REPLACE FUNCTION get_aov_summary(
  p_restaurant_id uuid,
  p_start_at      timestamptz,
  p_end_at        timestamptz
)
RETURNS TABLE (
  accepted_count  bigint,
  direct_revenue  numeric,
  accepted_items  jsonb,
  total_revenue   numeric,
  session_count   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH submitted_spans AS (
    -- One row per span+order: DISTINCT is the H1 fix.
    SELECT DISTINCT te.span_id, (te.result->>'order_id')::uuid AS order_id
    FROM   table_events te
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.event_type    = 'order_submitted'
      AND  te.created_at   >= p_start_at
      AND  te.created_at   <  p_end_at
  ),
  rec_adds AS (
    -- One row per span+item: tapping the same pairing chip twice is one accept.
    SELECT DISTINCT te.span_id, te.payload->>'itemId' AS item_id
    FROM   table_events te
    JOIN   submitted_spans ss ON ss.span_id = te.span_id
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.event_type    = 'item_added'
      AND  te.payload->>'source' IN ('pairing_chip', 'completion_nudge')
  ),
  survived AS (
    -- Same survival rule as v3: the item is in the order's final items_json,
    -- checked in order_history (billed) or orders (in-flight).
    SELECT ra.span_id, ra.item_id, mi.name AS item_name, mi.price AS price
    FROM   rec_adds ra
    JOIN   submitted_spans ss ON ss.span_id = ra.span_id
    JOIN   menu_items mi ON mi.id::text = ra.item_id
    WHERE  EXISTS (
        SELECT 1 FROM order_history oh
        WHERE  oh.original_order_id = ss.order_id
          AND  EXISTS (SELECT 1 FROM jsonb_array_elements(oh.items_json) elem
                       WHERE elem->>'id' = ra.item_id)
      )
      OR EXISTS (
        SELECT 1 FROM orders o
        WHERE  o.id = ss.order_id
          AND  EXISTS (SELECT 1 FROM jsonb_array_elements(o.items_json) elem
                       WHERE elem->>'id' = ra.item_id)
      )
  ),
  per_item AS (
    SELECT item_id, item_name, COUNT(*)::bigint AS cnt, SUM(price)::numeric AS revenue
    FROM survived GROUP BY item_id, item_name ORDER BY SUM(price) DESC
  ),
  items_json_arr AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'item_name', item_name, 'count', cnt, 'revenue', ROUND(revenue, 2))), '[]'::jsonb) AS arr
    FROM per_item
  ),
  orders_agg AS (
    SELECT COALESCE(SUM(oh.total), 0)::numeric AS total_revenue
    FROM   order_history oh
    JOIN   (SELECT DISTINCT order_id FROM submitted_spans) so ON so.order_id = oh.original_order_id
    UNION ALL
    SELECT COALESCE(SUM(o.total), 0)::numeric
    FROM   orders o
    JOIN   (SELECT DISTINCT order_id FROM submitted_spans) so ON so.order_id = o.id
  ),
  sessions_agg AS (
    SELECT COUNT(DISTINCT te.span_id)::bigint AS session_count
    FROM   table_events te
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.event_type    = 'session_started'
      AND  te.created_at   >= p_start_at
      AND  te.created_at   <  p_end_at
  )
  SELECT
    (SELECT COUNT(*)::bigint                  FROM survived)       AS accepted_count,
    (SELECT ROUND(COALESCE(SUM(price), 0), 2) FROM survived)       AS direct_revenue,
    (SELECT arr                               FROM items_json_arr) AS accepted_items,
    ROUND((SELECT COALESCE(SUM(total_revenue), 0) FROM orders_agg), 2) AS total_revenue,
    (SELECT session_count FROM sessions_agg)                       AS session_count;
$$;

COMMENT ON FUNCTION get_aov_summary(uuid, timestamptz, timestamptz) IS
  'v4 (0050): reads table_events ledger; DISTINCT span/order dedupe fixes audit H1.';
```

Check `order_history.original_order_id`'s column type first (`\d order_history` or the types file): if it is `text`, keep v3's `::text` comparison style (`oh.original_order_id = ss.order_id::text`); the SQL above assumes uuid.

Note: spans opened implicitly by `order_submitted` (no `session_started` event) are intentionally excluded from `session_count` denominator only if you count sessions by `session_started`; to include them, `sessions_agg` may instead count `DISTINCT span_id` across ALL event types in range. Decide by matching what AovView labels the number as — if it's "sessions", use the all-events variant. Default to the all-events variant:

```sql
  sessions_agg AS (
    SELECT COUNT(DISTINCT te.span_id)::bigint AS session_count
    FROM   table_events te
    WHERE  te.restaurant_id = p_restaurant_id
      AND  te.span_id IS NOT NULL
      AND  te.created_at >= p_start_at
      AND  te.created_at <  p_end_at
  )
```

- [ ] **Step 3: Apply, regen types, run tests**

Same three `gen types` commands as Task 4, then `npm run test:golden`. Expected: PASS (12 tests).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0050_get_aov_summary_v4.sql apps/*/src/integrations/supabase/types.ts apps/kiosk/tests/golden-session.test.ts
git commit -m "feat: AOV v4 over the ledger with span-level dedupe (0050, fixes H1)"
```

---

### Task 13: Cleanup + documentation

**Files:**
- Delete: dead kiosk screens (audit L7): `UpsellPrompt`, `OrderSummaryScreen`, `ItemDetailScreen`, `SessionIdleScreen`, `OrderConfirmationScreen` under `apps/kiosk/src/components/` — **verify each is unimported first** (`grep -rn "<Name>" apps/kiosk/src`); skip any that has an importer.
- Modify: `docs/overview.md` (project state), `services/order-engine/CHANGELOG.md` only if touched (it wasn't — skip).
- Create: `docs/decisions/0019-table-events-ledger.md` from `docs/decisions/_template.md`.

**Interfaces:**
- Consumes: everything above merged and green.
- Produces: ADR 0019 recording the ledger decision (promoting the 2026-07-11 discussion note); overview.md reflects the new architecture.

- [ ] **Step 1: Delete verified-dead components**, run `cd apps/kiosk && npm run build && npm run test`. Expected PASS.

Also create `supabase/migrations/0051_drop_recommendation_events.sql` containing `DROP TABLE IF EXISTS recommendation_events;` — but ONLY after verifying nothing references it: `grep -rn "recommendation_events" apps/ services/ supabase/migrations/0047* supabase/migrations/0048* supabase/migrations/0049* supabase/migrations/0050*` must return no app-code hits (audit L7 says nothing writes to it since the event bus). If any hit exists, skip the drop and note why.

- [ ] **Step 2: Write ADR 0019** using `docs/decisions/_template.md` structure. Content: context = audit findings C1–C3/H1/M1/M4/M5 share one root cause (distributed session state); decision = append-only `table_events` + single `append_event()` writer + table-as-root-identity + derived sessions; consequences = kiosk stateless (boot from `get_table_state`), Realtime demoted to poke, 0019's trigger retired, `kiosk_events` frozen as history, AOV computed from ledger. Reference the two notes from 2026-07-11. Do NOT edit existing ADRs; if any contradicts (0010 sessions-as-first-class, 0014 reset-signal, 0017 event bus), mark them superseded **in the new ADR's frontmatter only** (`supersedes: 0010, 0014, 0017`) — per repo rules, old ADR files are not edited.

- [ ] **Step 3: Update `docs/overview.md`** — "Current status" section: ledger refactor landed (migrations 0047–0050), what changed, golden test command.

- [ ] **Step 4: Final full check**

```bash
cd apps/kiosk && npm run build && npm run test && npm run test:golden
cd ../pos && npm run build
cd ../dashboard && npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: ADR 0019 table-events ledger; remove dead kiosk screens"
```

---

## Out of scope (deliberately — do not let executors wander into these)

- **Surviving audit bugs** H3 (restaurant_id defaults), H4 (voice refresh — FROZEN), M3 (KOT status vocab / 0035 trigger), M8 (RLS/PII), L5 (Unsplash), L6 (phone regex): separate small fixes, not part of this plan.
- **One-app consolidation** (discussion note §4.1): separate plan, after this lands.
- **Performance work** (§5.2) and **image upload optimization** (§5.4): separate plans.
- **Per-line recommendation `source` inside `order_submitted.items`** (would make attribution fully loss-proof): follow-up once `OrderItem` carries source; v4's `rec_adds` approach only ever under-counts, never inflates.
- Remote deploy: after the user reviews, THEY push migrations and deploy — give commands, don't run them.
