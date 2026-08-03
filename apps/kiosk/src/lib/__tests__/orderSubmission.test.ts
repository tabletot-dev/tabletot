import { describe, it, expect, vi, beforeEach } from 'vitest';

// submitOrder's own logic — picking the event_id, deciding whether to reuse
// or mint a new one — is what's under test, so appendEvent is mocked at the
// boundary rather than exercising the real RPC/table-resolution path.
vi.mock('@/lib/ledger', () => ({
  appendEvent: vi.fn(),
}));

import { submitOrder } from '@/lib/orderSubmission';
import { appendEvent } from '@/lib/ledger';
import type { OrderItem } from '@/data/menu';

const cart: OrderItem[] = [
  { id: 'item-1', name: 'Espresso', price: 180, quantity: 2, category: 'Coffee', tags: [], is_veg: true },
];

describe('submitOrder idempotency key', () => {
  beforeEach(() => {
    vi.mocked(appendEvent).mockReset();
  });

  it('reuses the same event_id when retrying the same cart after a failure', async () => {
    // Simulates: RPC actually committed server-side, only the response was
    // lost. A NEW event_id here would mean the kitchen receives the round
    // twice on retry — exactly what idempotency is supposed to prevent.
    vi.mocked(appendEvent).mockRejectedValueOnce(new Error('network lost'));
    await expect(submitOrder(cart)).rejects.toThrow();
    const firstEventId = vi.mocked(appendEvent).mock.calls[0][2];

    vi.mocked(appendEvent).mockResolvedValueOnce({ order_id: 'o1', kot_id: 'k1', total: 360 });
    await submitOrder(cart);
    const secondEventId = vi.mocked(appendEvent).mock.calls[1][2];

    expect(secondEventId).toBe(firstEventId);
  });

  it('mints a new event_id once the cart has changed', async () => {
    vi.mocked(appendEvent).mockResolvedValueOnce({ order_id: 'o1', kot_id: 'k1', total: 360 });
    await submitOrder(cart);
    const firstEventId = vi.mocked(appendEvent).mock.calls[0][2];

    const changedCart: OrderItem[] = [
      ...cart,
      { id: 'item-2', name: 'Croissant', price: 120, quantity: 1, category: 'Bakery', tags: [], is_veg: true },
    ];
    vi.mocked(appendEvent).mockResolvedValueOnce({ order_id: 'o2', kot_id: 'k2', total: 480 });
    await submitOrder(changedCart);
    const secondEventId = vi.mocked(appendEvent).mock.calls[1][2];

    expect(secondEventId).not.toBe(firstEventId);
  });
});
