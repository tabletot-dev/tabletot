import { MenuItem, menuItems } from "@/data/menu";

// Simple pairing logic: suggest items from a different category
const pairings: Record<string, string[]> = {
  Mains: ["Sides", "Drinks"],
  Sides: ["Mains", "Drinks"],
  Desserts: ["Drinks"],
  Drinks: ["Desserts", "Mains"],
};

export function getUpsellItem(addedItem: MenuItem): MenuItem | null {
  const suggestFrom = pairings[addedItem.category] || ["Sides"];
  const candidates = menuItems.filter(
    (m) => suggestFrom.includes(m.category) && m.id !== addedItem.id
  );
  if (candidates.length === 0) return null;
  // Pick a random candidate for variety
  return candidates[Math.floor(Math.random() * candidates.length)];
}
