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
