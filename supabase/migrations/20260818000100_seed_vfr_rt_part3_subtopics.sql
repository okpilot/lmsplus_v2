-- Seed the four Part 3 subtopics under the VFR RT subject.
--
-- WHY: Part 3 is the only RT topic that tests more than one skill. The VictorOne briefing names
-- four competencies for it -- number transmission, distress/urgency sequencing, position-report
-- sequencing, and identifying the parts of a traffic pattern -- and a student preparing for the
-- exam wants to drill one of them at a time, the same way the core ECQB subjects break down into
-- areas and subareas. Parts 1 and 2 stay flat by design: Part 1 is a closed 40-acronym list the
-- briefing prints as a single pool, and Part 2's dialogues are not divided by the briefing.
--
-- The subtopic ROWS are the only thing seeded here. Assigning questions to them is done by the
-- content importer (apps/web/scripts/import-vfr-rt-content.ts), keyed on these codes -- no
-- question row is touched by this migration.
--
-- Notes:
-- - Idempotency: easa_subtopics UNIQUE is (topic_id, code), NOT (code) alone (declared inline on its
--   CREATE TABLE in 20260311000001_initial_schema.sql),
--   so ON CONFLICT names both columns; a bare ON CONFLICT (code) would raise 42P10. Re-running
--   is a no-op. This mirrors the same care taken for easa_topics in mig 097.
-- - FK lookup via JOINs on the subject/topic codes (easa_topics -> easa_subjects) -- no hard-coded UUIDs.
-- - sort_order follows the briefing's own ordering of the four competencies.
-- - The two sequencing subareas share a question type (`ordering`) but test different content,
--   which is exactly why they are separate: a student drilling MAYDAY sequencing should not also
--   be drawing position reports.

INSERT INTO easa_subtopics (topic_id, code, name, sort_order)
SELECT t.id, st.code, st.name, st.sort_order
FROM easa_topics t
JOIN easa_subjects s ON s.id = t.subject_id
CROSS JOIN (VALUES
  ('P3_NUMBERS',   'Transmission of Numbers',      1),
  ('P3_EMERGENCY', 'Distress & Urgency Messages',  2),
  ('P3_POSREP',    'Position Reports',             3),
  ('P3_PATTERN',   'Traffic Pattern',              4)
) AS st(code, name, sort_order)
WHERE s.code = 'RT' AND t.code = 'P3_MC'
ON CONFLICT (topic_id, code) DO NOTHING;

-- Fail the APPLY if the four rows are not there afterwards.
--
-- Without this the migration is a silent no-op whenever subject 'RT' or topic 'P3_MC' is absent or
-- renamed: the SELECT yields zero rows, the INSERT still succeeds, and the migration applies clean.
-- The failure then surfaces far away and much later, when the content importer rejects every Part 3
-- file at lookupSubtopicByCode. Same stance the importer takes in this PR — throw, never silently
-- unfile.
--
-- Asserts EXISTENCE, not rows-inserted. A re-apply legitimately inserts zero (ON CONFLICT DO
-- NOTHING) while all four rows are present, so counting insertions would turn the idempotency this
-- migration is built for into a spurious failure.
DO $$
DECLARE
  v_found integer;
BEGIN
  SELECT count(*) INTO v_found
  FROM easa_subtopics st
  JOIN easa_topics t ON t.id = st.topic_id
  JOIN easa_subjects s ON s.id = t.subject_id
  WHERE s.code = 'RT'
    AND t.code = 'P3_MC'
    AND st.code IN ('P3_NUMBERS', 'P3_EMERGENCY', 'P3_POSREP', 'P3_PATTERN');

  IF v_found <> 4 THEN
    RAISE EXCEPTION
      'VFR RT Part 3 subtopic seed found % of 4 rows under subject RT / topic P3_MC — the parent subject or topic is missing or renamed, so the seed matched nothing',
      v_found;
  END IF;
END $$;
