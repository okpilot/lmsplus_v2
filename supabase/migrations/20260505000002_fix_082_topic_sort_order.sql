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

UPDATE easa_topics
SET sort_order = v.sort_order
FROM (VALUES
  ('082-01', 11),
  ('082-02', 12),
  ('082-03', 13),
  ('082-04', 14),
  ('082-06', 16)
) AS v(code, sort_order)
WHERE easa_topics.code = v.code
  AND easa_topics.subject_id = (SELECT id FROM easa_subjects WHERE code = '080');
