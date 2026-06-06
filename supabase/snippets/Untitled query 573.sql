-- 2. Does Silver have pairings configured? (No pairings = no panel ever appears)
SELECT COUNT(*) AS pairing_count FROM item_pairings p
JOIN menu_items m ON m.id = p.source_item_id
WHERE m.restaurant_id = (SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee');