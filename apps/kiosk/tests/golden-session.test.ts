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
  await admin.from('table_events').delete().eq('table_id', table.id);
  await admin.from('table_state').delete().eq('table_id', table.id);
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
