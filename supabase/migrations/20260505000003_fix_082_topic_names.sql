-- Fix 082 topic names. The import bundle's manifest had empty topic_name fields
-- and the per-question JSON files stored the LAST subtopic's name in topic_name —
-- so 20260505000001_seed_082_instrumentation.sql shipped wrong topic titles for
-- 082-02..06 (e.g. 082-04 was named "Directional gyroscope", which is actually
-- subtopic 082-04-04). Rename to standard EASA syllabus headings.

UPDATE easa_topics SET name = 'Measurement of air data parameters' WHERE code = '082-02';
UPDATE easa_topics SET name = 'Magnetism — direct reading compass' WHERE code = '082-03';
UPDATE easa_topics SET name = 'Gyroscopic instruments'             WHERE code = '082-04';
UPDATE easa_topics SET name = 'Warning and recording equipment'    WHERE code = '082-06';
