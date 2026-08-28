// GST rate is restaurant-configurable (restaurant_settings.gst_rate,
// percentage points — e.g. 5 means 5%) so it can't be a hardcoded module
// constant here: the same rate must also be what append_event actually
// charges (see migration 0069) and what POS's Billing.tsx displays, or the
// three silently disagree the moment anyone changes the setting
// (2026-08-28 audit, finding 7). Callers fetch the live rate via
// useRestaurant().gstRatePercent and pass it in; the default below only
// covers a caller that hasn't been updated yet, not a real fallback path.
export const DEFAULT_GST_RATE_PERCENT = 5;

export function computeTotals(subtotal: number, gstRatePercent: number = DEFAULT_GST_RATE_PERCENT) {
  const tax = (subtotal * gstRatePercent) / 100;
  return { subtotal, tax, total: subtotal + tax };
}
