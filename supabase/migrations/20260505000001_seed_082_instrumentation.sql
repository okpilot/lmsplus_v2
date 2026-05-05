-- Seed taxonomy for the ECQB-082 (Instrumentation) bundle under the existing EASA
-- subject 080 (Aircraft General Knowledge — Aeroplane). Source: manifest v3 in
-- QDB/ecqb_082_full_import.zip, 143 questions across 16 subtopics.
--
-- This migration is data-only: subject 080 + 5 topics + 16 subtopics. The subject row
-- duplicates the insert in 20260504000001_seed_080_agk.sql with ON CONFLICT DO NOTHING
-- so the two migrations can apply in either order on a fresh database (the 080 seed
-- branch is a separate PR; defensive copy keeps this migration self-contained).
-- Question rows are loaded separately via the import script (PostgREST + service-role
-- key), keyed by these codes.
--
-- Notes:
-- - Topic and subtopic names taken verbatim from the import bundle.
-- - sort_order on topics preserves real ECQB syllabus numbering: 1,2,3,4,6. The
--   intentional gap at 082-05 (Inertial Reference Systems) ships zero questions in
--   this bundle.
-- - Idempotency: ON CONFLICT (subject_id, code) / (topic_id, code) DO NOTHING.
--   Re-running is a no-op.
-- - All FK lookups via subquery on `code` — no hard-coded UUIDs.

INSERT INTO easa_subjects (code, name, short, sort_order)
VALUES ('080', 'Aircraft General Knowledge (Aeroplane)', 'AGK', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO easa_topics (subject_id, code, name, sort_order)
SELECT s.id, t.code, t.name, t.sort_order
FROM easa_subjects s
CROSS JOIN (VALUES
  ('082-01', 'Instrument and indication systems', 1),
  ('082-02', 'Air speed indicator',               2),
  ('082-03', 'Direct reading compass',            3),
  ('082-04', 'Directional gyroscope',             4),
  ('082-06', 'Stall warning',                     6)
) AS t(code, name, sort_order)
WHERE s.code = '080'
ON CONFLICT (subject_id, code) DO NOTHING;

INSERT INTO easa_subtopics (topic_id, code, name, sort_order)
SELECT t.id, s.code, s.name, s.sort_order
FROM easa_topics t
JOIN (VALUES
  -- 082-01
  ('082-01', '082-01-01', 'Pressure gauge',                  1),
  ('082-01', '082-01-02', 'Temperature sensing',             2),
  ('082-01', '082-01-03', 'Fuel gauge',                      3),
  ('082-01', '082-01-06', 'Tachometer',                      6),
  -- 082-02
  ('082-02', '082-02-01', 'Pressure measurement',            1),
  ('082-02', '082-02-03', 'Altimeter',                       3),
  ('082-02', '082-02-04', 'Vertical speed indicator (VSI)',  4),
  ('082-02', '082-02-05', 'Air speed indicator',             5),
  -- 082-03
  ('082-03', '082-03-01', 'Earth magnetic field',            1),
  ('082-03', '082-03-02', 'Direct reading compass',          2),
  -- 082-04
  ('082-04', '082-04-01', 'Gyroscope: basic principles',     1),
  ('082-04', '082-04-02', 'Turn and bank indicator',         2),
  ('082-04', '082-04-03', 'Attitude indicator',              3),
  ('082-04', '082-04-04', 'Directional gyroscope',           4),
  -- 082-06
  ('082-06', '082-06-01', 'Flight warning systems',          1),
  ('082-06', '082-06-02', 'Stall warning',                   2)
) AS s(topic_code, code, name, sort_order) ON s.topic_code = t.code
WHERE t.subject_id = (SELECT id FROM easa_subjects WHERE code = '080')
ON CONFLICT (topic_id, code) DO NOTHING;
