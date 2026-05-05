-- Fix sort_order on the 082 (Instrumentation) topics so they render AFTER the 081
-- (Airframe/Systems) topics in the per-subject topic tree under subject 080 (AGK).
--
-- Background: 20260504000001_seed_080_agk.sql seeded 081-01..09 with sort_order 1..9.
-- 20260505000001_seed_082_instrumentation.sql then seeded 082-01,02,03,04,06 with
-- sort_order 1,2,3,4,6 — colliding with 081 and producing interleaved UI.
--
-- Fix: shift the 082 topics into the 11..16 range (preserves trailing-digit
-- convention and the intentional gap at sort_order 15 for 082-05).
-- Subtopic sort_order is partitioned by topic_id and stays as-is.

UPDATE easa_topics SET sort_order = 11 WHERE code = '082-01';
UPDATE easa_topics SET sort_order = 12 WHERE code = '082-02';
UPDATE easa_topics SET sort_order = 13 WHERE code = '082-03';
UPDATE easa_topics SET sort_order = 14 WHERE code = '082-04';
UPDATE easa_topics SET sort_order = 16 WHERE code = '082-06';
