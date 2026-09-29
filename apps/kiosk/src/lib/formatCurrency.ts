// Drops the paise when there aren't any (₹390, not ₹390.00) — Indian food
// apps never show ".00", and it was the loudest text on the cart/bill rows.
export function formatRupees(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `₹${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}
