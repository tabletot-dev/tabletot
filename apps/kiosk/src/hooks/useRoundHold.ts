import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderItem } from "@/data/menu";
import {
  HOLD_DURATION_MS,
  savePendingRound,
  loadPendingRound,
  clearPendingRound,
  isExpired,
  type PendingRound,
} from "@/lib/pendingRound";

export function useRoundHold(onExpire: (items: OrderItem[], displayName?: string) => void) {
  const [held, setHeld] = useState<PendingRound | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Held in a ref so the one-second tick below never needs to re-subscribe
  // when the caller passes a fresh closure.
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  // Restore across a reload. If the deadline already passed while the device
  // was off, send immediately rather than discarding: the guest pressed Send
  // and is expecting food, so the safe failure is a late round, not a lost one.
  useEffect(() => {
    const stored = loadPendingRound();
    if (!stored) return;
    if (isExpired(stored)) {
      clearPendingRound();
      onExpireRef.current(stored.items, stored.displayName);
      return;
    }
    setHeld(stored);
  }, []);

  useEffect(() => {
    if (!held) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = held.deadline - Date.now();
      if (remaining <= 0) {
        clearPendingRound();
        setHeld(null);
        onExpireRef.current(held.items, held.displayName);
        return;
      }
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [held]);

  const startHold = useCallback((items: OrderItem[], displayName?: string) => {
    const round = { items, deadline: Date.now() + HOLD_DURATION_MS, displayName };
    savePendingRound(round);
    setHeld(round);
  }, []);

  // Adding an item during the hold restarts the clock — otherwise an item
  // added at 1:58 would reach the kitchen two seconds later, on its own.
  // The originally-captured displayName carries over unchanged.
  const extendHold = useCallback((items: OrderItem[]) => {
    setHeld((prev) => {
      if (!prev) return prev;
      const round = { items, deadline: Date.now() + HOLD_DURATION_MS, displayName: prev.displayName };
      savePendingRound(round);
      return round;
    });
  }, []);

  const cancelHold = useCallback(() => {
    clearPendingRound();
    setHeld(null);
  }, []);

  const sendNow = useCallback(() => {
    if (!held) return;
    clearPendingRound();
    setHeld(null);
    onExpireRef.current(held.items, held.displayName);
  }, [held]);

  return {
    heldItems: held?.items ?? null,
    secondsLeft,
    isHolding: held !== null,
    startHold,
    extendHold,
    cancelHold,
    sendNow,
  };
}
