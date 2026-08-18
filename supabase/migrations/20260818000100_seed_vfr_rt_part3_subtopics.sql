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
