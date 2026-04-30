import { MenuItem } from "@/data/menu";

// Suggest an item from a complementary category.
// Categories are dynamic (from DB), so we use a simple "different category" heuristic.
export function getUpsellItem(addedItem: MenuItem, allItems: MenuItem[]): MenuItem | null {
  const candidates = allItems.filter(
    (m) => m.category !== addedItem.category && m.id !== addedItem.id
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
