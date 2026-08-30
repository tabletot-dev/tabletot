import { useState, useCallback, useEffect } from "react";
import { MenuItem, OrderItem } from "@/data/menu";
import { submitOrder, clearSession } from "@/lib/orderSubmission";
import { track, type Source } from "@/lib/eventBus";
import type { TableState } from "@/lib/ledger";
import { loadCart, saveCart } from "@/lib/cartStorage";

export type ScreenType =
  | "idle"
  | "voice-conversation"
  | "menu"
  | "popular"
  | "item-detail"
  | "order-summary"
  | "sent"
  | "order-confirmation"
  | "session-idle"
  | "games"
  | "conversation-starters"
  | "bill-summary"
  | "about";

export interface OrderRound {
  orderId: string;
  items: OrderItem[];
  total: number;
  timestamp: Date;
}

export function useDeviceNavigation() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("idle");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [order, setOrder] = useState<OrderItem[]>(loadCart);
  const [previousOrders, setPreviousOrders] = useState<OrderRound[]>([]);
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);

  // Persist on every change, including the clear to [] on submit/cancel/end
  // — writing '[]' is exactly the "nothing to restore" state loadCart already
  // treats as empty, so no separate clear path is needed.
  useEffect(() => {
    saveCart(order);
  }, [order]);

  // Runs once, at mount, before useRoundHold's own restore effect and
  // Index.tsx's server-state hydration effect (both declared later in
  // IndexInner, so their effects run after this one and can override it).
  // A restored non-empty cart with nothing more authoritative to show
  // (no held round, no active server-side order) takes the guest to "menu"
  // instead of leaving them on the idle/attract screen with a full cart
  // sitting invisibly behind it.
  useEffect(() => {
    if (order.length > 0) {
      setCurrentScreen("menu");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToOrder = useCallback((item: MenuItem, source: Source, qty = 1) => {
    setOrder((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        return prev.map((o) =>
          o.id === item.id ? { ...o, quantity: o.quantity + qty } : o
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
    track("item_added", { itemId: item.id, source });
  }, []);

  // delta > 0 emits item_added with the supplied source. delta < 0 emits one
  // item_removed regardless of whether the row drops out (quantity hit zero)
  // or just decremented — the cart still lost one unit either way.
  const updateQuantity = useCallback((itemId: string, delta: number, source: Source) => {
    setOrder((prev) => {
      return prev
        .map((o) =>
          o.id === itemId ? { ...o, quantity: o.quantity + delta } : o
        )
        .filter((o) => o.quantity > 0);
    });
    if (delta > 0) {
      track("item_added", { itemId, source });
    } else if (delta < 0) {
      track("item_removed", { itemId });
    }
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setOrder((prev) => prev.filter((o) => o.id !== itemId));
    track("item_removed", { itemId });
  }, []);

  // Throws on failure instead of alert()ing — a blocking native dialog has no
  // "try again" path and stalls the whole kiosk.
  //
  // Takes `items` explicitly rather than reading the live `order` state.
  // The only caller is the round-hold's expiry callback, which passes the
  // items captured at "Send to kitchen" time (persisted in sessionStorage
  // via useRoundHold/pendingRound). Reading closured `order` here instead
  // used to submit whatever the live cart happened to contain at expiry —
  // empty after a reload (the cart itself is not persisted), so a guest who
  // reloaded mid-hold saw "Order Confirmed" while nothing reached the
  // kitchen and no revenue was recorded (2026-08-28 audit, finding 1).
  const confirmOrder = useCallback(async (items: OrderItem[]) => {
    if (items.length > 0) {
      let orderId: string;
      try {
        const result = await submitOrder(items);
        orderId = result.orderId;
      } catch (err) {
        console.error("Order submission failed:", err);
        throw err;
      }
      setPreviousOrders((prev) => [
        ...prev,
        {
          orderId,
          items: [...items],
          total: items.reduce((sum, o) => sum + o.price * o.quantity, 0),
          timestamp: new Date(),
        },
      ]);
      setOrder([]);
    }
    setCurrentScreen("order-confirmation");
  }, []);

  const endSession = useCallback(() => {
    setOrder([]);
    setPreviousOrders([]);
    setCurrentScreen("idle");
    void clearSession();
  }, []);

  // Rebuild previousOrders from server truth (get_table_state) so a reloaded or
  // power-cycled kiosk shows the full session history (audit M5). Each ledger
  // "round" is a KOT; they all belong to the single live order, so every round
  // carries state.order_id — that keeps the derived currentRoundOrderId pointing
  // at the live order for WaitingView's kitchen-status subscription.
  // ponytail: rounds carry only {id,name,qty,price}, so category/is_veg default
  // out — the sidebar veg dot on the post-reload history is cosmetically wrong.
  // Enrich from menuStore by id if that dot ever matters.
  const hydrateFromTableState = useCallback((state: TableState) => {
    setPreviousOrders(
      state.rounds.map((round) => ({
        orderId: state.order_id ?? "",
        items: round.items.map((line) => ({
          id: line.id,
          name: line.name,
          price: line.price,
          quantity: line.qty,
          category: "",
          tags: [],
          is_veg: false,
        })),
        total: round.items.reduce((sum, line) => sum + line.price * line.qty, 0),
        timestamp: new Date(round.created_at),
      })),
    );
  }, []);

  const totalBill = order.reduce((sum, o) => sum + o.price * o.quantity, 0);
  // Submitted rounds only — BillView itemizes previousOrders, not the unsent
  // cart, so including totalBill here made the displayed total exceed the
  // sum of its own listed lines (and what POS actually charges) (audit M1).
  const sessionTotal = previousOrders.reduce((sum, r) => sum + r.total, 0);
  const currentRoundOrderId = previousOrders.length > 0
    ? previousOrders[previousOrders.length - 1].orderId
    : null;

  return {
    currentScreen,
    setCurrentScreen,
    selectedItem,
    setSelectedItem,
    order,
    setOrder,
    addToOrder,
    updateQuantity,
    removeItem,
    confirmOrder,
    endSession,
    hydrateFromTableState,
    totalBill,
    sessionTotal,
    currentRoundOrderId,
    previousOrders,
    setPreviousOrders,
    voiceOverlayOpen,
    setVoiceOverlayOpen,
  };
}
