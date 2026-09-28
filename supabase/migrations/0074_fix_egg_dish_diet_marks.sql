-- Fix diet marks on egg dishes incorrectly flagged Veg.
--
-- Found during the 2026-09-28 kiosk UX audit: French Omelette, Turkish Eggs,
-- and French Toast all contain egg but had is_veg = true. Egg Bagel was
-- already correctly Non-Veg. Scoped to Silver (the only restaurant with menu
-- data today) by name match rather than restaurant_id, so this also
-- self-heals for any future restaurant seeded with the same dish names.
UPDATE menu_items
SET is_veg = false
WHERE name IN ('French Omelette', 'Turkish Eggs', 'French Toast')
  AND is_veg = true;
