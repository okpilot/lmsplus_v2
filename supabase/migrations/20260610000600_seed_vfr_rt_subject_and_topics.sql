-- Migration 097: seed the VFR RT (Slovenia) subject + Part 1/2/3 topics (#697).
--
-- Syllabus skeleton only — question rows are NOT inserted here; they are
-- admin-authored via the editor or bulk-imported separately, keyed by these
-- codes. The three topics mirror the parts of the Slovenia VFR
-- radiotelephony briefing package.
--
-- Notes:
-- - sort_order 9 places RT after the core ECQB subjects (communications /
--   radiotelephony is the 9th subject in EASA PPL syllabus ordering).
-- - Idempotency: ON CONFLICT (code) DO NOTHING on easa_subjects
--   (UNIQUE (code), mig 001) and ON CONFLICT (subject_id, code) DO NOTHING
--   on easa_topics — its UNIQUE is (subject_id, code), NOT (code) alone
--   (mig 001 line 67); a bare ON CONFLICT (code) would raise 42P10.
--   Re-running is a no-op.
-- - No subtopics in v1.
-- - FK lookup via subquery on code — no hard-coded UUIDs.

INSERT INTO easa_subjects (code, name, short, sort_order)
VALUES ('RT', 'VFR Radiotelephony (Slovenia)', 'RT', 9)
ON CONFLICT (code) DO NOTHING;

INSERT INTO easa_topics (subject_id, code, name, sort_order)
SELECT s.id, t.code, t.name, t.sort_order
FROM easa_subjects s
CROSS JOIN (VALUES
  ('P1_ACRONYMS', 'Part 1 — Acronyms & Definitions', 1),
  ('P2_DIALOG',   'Part 2 — Dialog Completion',      2),
  ('P3_MC',       'Part 3 — Multiple Choice',        3)
) AS t(code, name, sort_order)
WHERE s.code = 'RT'
ON CONFLICT (subject_id, code) DO NOTHING;
