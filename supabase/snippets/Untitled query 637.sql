-- SELECT COUNT(*) FROM menu_items WHERE active = true;
-- SELECT COUNT(*) FROM external_id_mapping WHERE provider = 'petpooja';
-- SELECT COUNT(*) FROM menu_items WHERE tags IS NOT NULL;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;