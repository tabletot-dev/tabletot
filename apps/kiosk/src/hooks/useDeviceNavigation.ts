import { useState, useCallback } from "react";
import { MenuItem, OrderItem } from "@/data/menu";
import { submitOrder, clearSession } from "@/lib/orderSubmission";
import { track, type Source } from "@/lib/eventBus";

export type ScreenType =
  | "idle"
  | "home"
  | "identity"
  | "listening"
  | "menu"
  | "item-detail"
  | "order-summary"
  | "order-confirmation"
  | "session-idle"
  | "games"
  | "conversation-starters"
  | "bill-summary";

export interface OrderRound {
  orderId: string;
  items: OrderItem[];
  total: number;
  timestamp: Date;
}

export function useDeviceNavigation() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("idle");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [previousOrders, setPreviousOrders] = useState<OrderRound[]>([]);
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);

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

  const confirmOrder = useCallback(async () => {
    if (order.length > 0) {
      let orderId: string;
      try {
        const result = await submitOrder(order);
        orderId = result.orderId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Order submission failed:", err);
        alert(`Order could not be sent: ${msg}`);
        return;
      }
      setPreviousOrders((prev) => [
        ...prev,
        {
          orderId,
          items: [...order],
          total: order.reduce((sum, o) => sum + o.price * o.quantity, 0),
          timestamp: new Date(),
        },
      ]);
      setOrder([]);
    }
    setCurrentScreen("order-confirmation");
  }, [order]);

  const endSession = useCallback(() => {
    setOrder([]);
    setPreviousOrders([]);
    setCurrentScreen("idle");
    void clearSession();
  }, []);

  const totalBill = order.reduce((sum, o) => sum + o.price * o.quantity, 0);
  const sessionTotal = previousOrders.reduce((sum, r) => sum + r.total, 0) + totalBill;
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
    totalBill,
    sessionTotal,
    currentRoundOrderId,
    previousOrders,
    setPreviousOrders,
    voiceOverlayOpen,
    setVoiceOverlayOpen,
  };
}
