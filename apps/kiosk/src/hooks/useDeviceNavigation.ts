import { useState, useCallback } from "react";
import { MenuItem, OrderItem } from "@/data/menu";
import { submitOrder } from "@/lib/orderSubmission";

export type ScreenType =
  | "idle"
  | "listening"
  | "menu"
  | "item-detail"
  | "order-summary"
  | "order-confirmation"
  | "session-idle"
  | "bill-summary";

export interface OrderRound {
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

  const addToOrder = useCallback((item: MenuItem, qty = 1) => {
    setOrder((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        return prev.map((o) =>
          o.id === item.id ? { ...o, quantity: o.quantity + qty } : o
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setOrder((prev) => {
      return prev
        .map((o) =>
          o.id === itemId ? { ...o, quantity: o.quantity + delta } : o
        )
        .filter((o) => o.quantity > 0);
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setOrder((prev) => prev.filter((o) => o.id !== itemId));
  }, []);

  const confirmOrder = useCallback(async () => {
    if (order.length > 0) {
      try {
        await submitOrder(order);
      } catch (err) {
        console.error("Order submission failed:", err);
        alert("Order could not be sent. Please try again.");
        return;
      }
      setPreviousOrders((prev) => [
        ...prev,
        {
          items: [...order],
          total: order.reduce((sum, o) => sum + o.price * o.quantity, 0),
          timestamp: new Date(),
        },
      ]);
      setOrder([]);
    }
    setCurrentScreen("order-confirmation");
  }, [order]);

  const totalBill = order.reduce((sum, o) => sum + o.price * o.quantity, 0);
  const sessionTotal = previousOrders.reduce((sum, r) => sum + r.total, 0) + totalBill;

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
    totalBill,
    sessionTotal,
    previousOrders,
    setPreviousOrders,
    voiceOverlayOpen,
    setVoiceOverlayOpen,
  };
}
