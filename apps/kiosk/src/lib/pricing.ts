export const TAX_RATE = 0.05; // 5% GST

export function computeTotals(subtotal: number) {
  const tax = subtotal * TAX_RATE;
  return { subtotal, tax, total: subtotal + tax };
}
