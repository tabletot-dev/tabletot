import type { OrderItem } from "@/data/menu";

// The live, not-yet-sent cart lived only in React state — a reload mid-browse
// (before "Send to kitchen") lost it entirely and dropped the guest back to
// the attract screen with no explanation (2026-08-28 audit, finding 10).
// Distinct from pendingRound.ts, which persists a round AFTER it's been
// confirmed and is counting down to submit: this is for a cart the guest is
// still deciding on.
const KEY = "tt_current_cart";

export function saveCart(order: OrderItem[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // sessionStorage can throw (private browsing quota, disabled storage) —
    // losing persistence is acceptable, losing the ability to keep ordering
    // is not.
  }
}

export function loadCart(): OrderItem[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
  } catch {
    return [];
  }
}
