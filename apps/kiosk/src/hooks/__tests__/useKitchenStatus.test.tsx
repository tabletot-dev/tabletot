import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Mimics supabase-js: channel(name) returns the SAME object for a repeated
// name, and `.on()` after `.subscribe()` throws.
const channels = new Map<string, { subscribed: boolean; on: () => unknown; subscribe: () => unknown }>();
vi.mock("@/integrations/supabase/client", () => ({
  hasSupabaseConfig: true,
  supabase: {
    channel: (name: string) => {
      if (!channels.has(name)) {
        const ch = {
          subscribed: false,
          on() {
            if (ch.subscribed) throw new Error("cannot add `postgres_changes` callbacks after `subscribe()`");
            return ch;
          },
          subscribe() {
            ch.subscribed = true;
            return ch;
          },
        };
        channels.set(name, ch);
      }
      return channels.get(name);
    },
    removeChannel: vi.fn(),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { status: "preparing" } }) }) }),
    }),
  },
}));

import { useKitchenStatus } from "../useKitchenStatus";

describe("useKitchenStatus", () => {
  it("two watchers of the same order don't collide on one channel", () => {
    expect(() => {
      renderHook(() => useKitchenStatus("order-1"));
      renderHook(() => useKitchenStatus("order-1"));
    }).not.toThrow();
  });
});
