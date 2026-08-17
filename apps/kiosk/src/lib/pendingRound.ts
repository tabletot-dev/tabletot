import type { OrderItem } from "@/data/menu";

// A submitted round is held on the device for two minutes before it reaches
// the kitchen, so the guest can still change their mind. Nothing is written to
// the ledger during the hold: a cancelled round never existed, which keeps
// get_aov_summary's direct_revenue correct with no server-side work.
//
// ponytail: sessionStorage, not the ledger. The exposure is two minutes with
// the guest sitting in front of a visible countdown — a reboot in that window
// is recoverable and obvious. If the hold ever grows past ~5 minutes, move it
// server-side behind a held-KOT flag instead.
export const HOLD_DURATION_MS = 120_000;

const KEY = "tt_pending_round";

export type PendingRound = { items: OrderItem[]; deadline: number; displayName?: string };

export function savePendingRound(round: PendingRound): void {
  sessionStorage.setItem(KEY, JSON.stringify(round));
}

export function loadPendingRound(): PendingRound | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" || parsed === null ||
      !Array.isArray((parsed as PendingRound).items) ||
      typeof (parsed as PendingRound).deadline !== "number"
    ) {
      return null;
    }
    return parsed as PendingRound;
  } catch {
    return null;
  }
}

export function clearPendingRound(): void {
  sessionStorage.removeItem(KEY);
}

export function isExpired(round: PendingRound, now: number = Date.now()): boolean {
  return round.deadline <= now;
}
