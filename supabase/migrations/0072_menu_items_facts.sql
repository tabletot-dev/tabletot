-- 0072_menu_items_facts.sql
--
-- Adds a nullable `facts` jsonb column to menu_items for structured,
-- per-item information the voice/Ask-AI layer can answer questions from:
-- calories, allergens, spice level, prep time, key ingredients, etc.
--
-- Shape is intentionally open (jsonb, no schema) so new fact keys don't
-- need a migration. Suggested keys, all optional:
--   {
--     "calories_kcal": 320,
--     "allergens": ["dairy", "gluten"],
--     "spice_level": "medium",          -- mild | medium | hot
--     "prep_minutes": 8,
--     "ingredients": ["sourdough", "avocado", "chilli flakes"],
--     "notes": "contains raw egg"
--   }
--
-- Rendered into the LLM menu summary by
-- services/order-engine/src/llm/prompts/menu_summary.py. The response
-- prompt forbids the model from stating any fact not present here for the
-- item (no estimating) — see system_prompt.py Truth Rule 6.
--
-- Numbered 0072 (not 0071) because 0071_about_venue_config.sql already
-- exists on the kiosk-v1-sprint-6-7 branch and is unmerged; reusing the
-- number would collide when both land.
--
-- Data-free: facts content is populated per item by the venue, not here.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS facts jsonb;
