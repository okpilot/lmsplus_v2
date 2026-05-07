-- Fix 082 topic names. The import bundle's manifest had empty topic_name fields
-- and the per-question JSON files stored the LAST subtopic's name in topic_name —
-- so 20260505000001_seed_082_instrumentation.sql shipped wrong topic titles for
-- 082-02..06 (e.g. 082-04 was named "Directional gyroscope", which is actually
-- subtopic 082-04-04). Rename to standard EASA syllabus headings.

UPDATE easa_topics
SET name = v.name
FROM (VALUES
  ('082-02', 'Measurement of air data parameters'),
  ('082-03', 'Magnetism — direct reading compass'),
  ('082-04', 'Gyroscopic instruments'),
  ('082-06', 'Warning and recording equipment')
) AS v(code, name)
WHERE easa_topics.code = v.code
  AND easa_topics.subject_id = (SELECT id FROM easa_subjects WHERE code = '080');
