-- 1. How many accepted recommendations are there in total?
SELECT pattern_type, item_accepted, COUNT(*)
FROM recommendation_events
GROUP BY pattern_type, item_accepted;