-- Seed EASA subject 080 (Aircraft General Knowledge — Aeroplane) plus the 9 topics
-- and 26 subtopics covered by the ECQB 081 import bundle (QDB/ecqb_081_full_import.zip,
-- manifest.json v3, 168 questions).
--
-- This migration is data-only: subject/topic/subtopic taxonomy. Question rows are loaded
-- separately via the import script (PostgREST + service-role key), keyed by these codes.
--
-- Idempotency: ON CONFLICT (code) / (subject_id, code) / (topic_id, code) DO NOTHING.
-- Re-running is a no-op.

INSERT INTO easa_subjects (code, name, short, sort_order)
VALUES ('080', 'Aircraft General Knowledge (Aeroplane)', 'AGK', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO easa_topics (subject_id, code, name, sort_order)
SELECT s.id, t.code, t.name, t.sort_order
FROM easa_subjects s
CROSS JOIN (VALUES
  ('081-01', 'System design, loads, stresses, maintenance', 1),
  ('081-02', 'Airframe',                                    2),
  ('081-03', 'Hydraulics',                                  3),
  ('081-04', 'Landing gear, wheels, tyres and brakes',      4),
  ('081-05', 'Flight controls',                             5),
  ('081-06', 'Anti-icing systems',                          6),
  ('081-07', 'Fuel system',                                 7),
  ('081-08', 'Electrics',                                   8),
  ('081-09', 'Piston Engines',                              9)
) AS t(code, name, sort_order)
WHERE s.code = '080'
ON CONFLICT (subject_id, code) DO NOTHING;

INSERT INTO easa_subtopics (topic_id, code, name, sort_order)
SELECT t.id, s.code, s.name, s.sort_order
FROM easa_topics t
JOIN (VALUES
  -- 081-01
  ('081-01', '081-01-01', 'Loads and combination loadings applied to an aircraft''s structure', 1),
  -- 081-02
  ('081-02', '081-02-01', 'Wings, tail surfaces and control surfaces',                          1),
  ('081-02', '081-02-02', 'Fuselage, doors, floor, wind-screen and windows',                    2),
  -- 081-03
  ('081-03', '081-03-02', 'Hydraulic systems',                                                  2),
  -- 081-04
  ('081-04', '081-04-01', 'Landing gear',                                                       1),
  ('081-04', '081-04-02', 'Nose wheel steering',                                                2),
  ('081-04', '081-04-03', 'Brakes',                                                             3),
  ('081-04', '081-04-04', 'Wheels and tyres',                                                   4),
  -- 081-05
  ('081-05', '081-05-01', 'Aeroplane: primary flight controls',                                 1),
  ('081-05', '081-05-02', 'Aeroplane: secondary flight controls',                               2),
  -- 081-06
  ('081-06', '081-06-01', 'Concept, types and operation (pitot and windshield)',                1),
  -- 081-07
  ('081-07', '081-07-01', 'Piston engine',                                                      1),
  -- 081-08
  ('081-08', '081-08-01', 'Electrics: general and definitions',                                 1),
  ('081-08', '081-08-02', 'Batteries',                                                          2),
  ('081-08', '081-08-03', 'Static electricity: general',                                        3),
  ('081-08', '081-08-04', 'Generation: production, distribution and use',                       4),
  ('081-08', '081-08-06', 'Distribution',                                                       6),
  -- 081-09
  ('081-09', '081-09-01', 'General',                                                            1),
  ('081-09', '081-09-02', 'Fuel',                                                               2),
  ('081-09', '081-09-03', 'Carburettor or injection system',                                    3),
  ('081-09', '081-09-04', 'Air cooling systems',                                                4),
  ('081-09', '081-09-05', 'Lubrication systems',                                                5),
  ('081-09', '081-09-06', 'Ignition circuits',                                                  6),
  ('081-09', '081-09-07', 'Mixture',                                                            7),
  ('081-09', '081-09-08', 'Propellers',                                                         8),
  ('081-09', '081-09-09', 'Performance and engine handling',                                    9)
) AS s(topic_code, code, name, sort_order) ON s.topic_code = t.code
WHERE t.subject_id = (SELECT id FROM easa_subjects WHERE code = '080')
ON CONFLICT (topic_id, code) DO NOTHING;
