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
