-- Turn off the "Name for this order" field for Silver.
--
-- 2026-09-28 UX audit: the field gave no reason for being asked ("Optional"
-- with a blank placeholder), which reads as one more decision with no
-- payoff (Tesler's Law). No one has a use for the name today, so it's off
-- rather than kept-and-explained. The feature itself (CartView's
-- showNameField, prompt_for_identity in restaurants.config) stays — a
-- future restaurant that wants it can still turn it on.
UPDATE restaurants
SET config = jsonb_set(config, '{prompt_for_identity}', 'false'::jsonb)
WHERE slug = 'silver-ssc-hyd';
