-- #1639: Area 100 KSA syllabus under the ATPL(A) course.
-- Source: EASA Easy Access Rules for Aircrew (Reg. (EU) No 1178/2011), Nov 2025, "SUBJECT AREA 100 -
--   KNOWLEDGE, SKILLS AND ATTITUDES (KSA)", ED Decision 2020/018/R, PDF pp. 831-834.
-- Official codes (100 01 00 00, ...) are written hyphenated (100-01, 100-02-01), as for the PPL subjects.
-- Official 100 01 and 100 04 have no sub-topics; 100 02 has 5, 100 03 has 2.
-- DEVIATION (Decision 169): 11 LMS-only sub-topics 100-04-01..100-04-11 under 100-04, one per mental-maths
--   LO (01)-(11), named with the official LO titles. exam_config_distributions targets topic/sub-topic only,
--   so a per-LO draw needs one sub-topic per LO.
-- sort_order 12: after the highest existing subject (040 = 11); 10 is 070.
-- Arbiters: easa_subjects UNIQUE (code), easa_topics UNIQUE (subject_id, code), easa_subtopics UNIQUE
--   (topic_id, code) (20260311000001_initial_schema.sql). Re-apply is a no-op.
-- course_id is written here (authenticated has no column grant on it).

INSERT INTO public.easa_subjects (code, name, short, sort_order, course_id)
VALUES ('100', 'Area 100 KSA', 'KSA', 12, 'c0a5e000-0000-4000-8000-000000000003')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.easa_topics (subject_id, code, name, sort_order)
SELECT s.id, t.code, t.name, t.sort_order
FROM public.easa_subjects s
CROSS JOIN (VALUES
  ('100-01', 'ICAO core competencies', 1),
  ('100-02', 'Core competencies learning objectives', 2),
  ('100-03', 'Additional threat and error management (TEM) related learning objectives', 3),
  ('100-04', 'Mental maths', 4)
) AS t(code, name, sort_order)
WHERE s.code = '100'
ON CONFLICT (subject_id, code) DO NOTHING;

INSERT INTO public.easa_subtopics (topic_id, code, name, sort_order)
SELECT t.id, st.code, st.name, st.sort_order
FROM public.easa_topics t
JOIN public.easa_subjects s ON s.id = t.subject_id
JOIN (VALUES
  ('100-02', '100-02-01', 'Communication', 1),
  ('100-02', '100-02-02', 'Leadership and teamwork', 2),
  ('100-02', '100-02-03', 'Problem-solving and decision-making', 3),
  ('100-02', '100-02-04', 'Situation awareness', 4),
  ('100-02', '100-02-05', 'Workload management', 5),
  ('100-03', '100-03-01', 'Application of knowledge', 1),
  ('100-03', '100-03-02', 'Upset prevention and recovery training (UPRT) and resilience', 2),
  ('100-04', '100-04-01', 'Convert between volumes and masses of fuel using range of units', 1),
  ('100-04', '100-04-02', 'Estimate time, distance and speed', 2),
  ('100-04', '100-04-03', 'Estimate the rate of climb or rate of descent, distance and time', 3),
  ('100-04', '100-04-04', 'Add or subtract time, distance, and fuel mass', 4),
  ('100-04', '100-04-05', 'Calculate fuel burn given time and fuel flow', 5),
  ('100-04', '100-04-06', 'Calculate the time available (for decision-making) given relevant fuel information', 6),
  ('100-04', '100-04-07', 'Determine the top of descent using a simple method that is described by the approved training organisation (ATO)', 7),
  ('100-04', '100-04-08', 'Determine the values that vary by a percentage, e.g. dry-to-wet landing distance and fuel burn', 8),
  ('100-04', '100-04-09', 'Estimate heights at distances on a 3-degree glideslope', 9),
  ('100-04', '100-04-10', 'Estimate headings using the 1-in-60 rule', 10),
  ('100-04', '100-04-11', 'Estimate headwind and crosswind components given wind speed and direction and runway in use', 11)
) AS st(topic_code, code, name, sort_order) ON st.topic_code = t.code
WHERE s.code = '100'
ON CONFLICT (topic_id, code) DO NOTHING;

-- Asserts existence, not rows inserted (re-apply inserts zero).
DO $$
DECLARE
  v_course uuid;
  v_topics integer;
  v_subtopics integer;
BEGIN
  SELECT s.course_id, count(t.id) INTO v_course, v_topics
  FROM public.easa_subjects s
  LEFT JOIN public.easa_topics t ON t.subject_id = s.id AND t.code IN ('100-01', '100-02', '100-03', '100-04')
  WHERE s.code = '100'
  GROUP BY s.course_id;

  SELECT count(st.id) INTO v_subtopics
  FROM public.easa_subjects s
  JOIN public.easa_topics t ON t.subject_id = s.id
  JOIN public.easa_subtopics st ON st.topic_id = t.id
  WHERE s.code = '100';

  IF v_course IS DISTINCT FROM 'c0a5e000-0000-4000-8000-000000000003'::uuid OR v_topics <> 4 OR v_subtopics <> 18 THEN
    RAISE EXCEPTION 'Area 100 KSA seed: subject 100 course %, % of 4 topics, % of 18 subtopics', v_course, v_topics, v_subtopics;
  END IF;
END $$;
