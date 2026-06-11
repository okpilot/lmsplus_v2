-- Migration 098: exam_configs.parts_config — per-part exam composition (#697).
--
-- The VFR RT mock exam samples question counts per part (Part 1 acronyms,
-- Part 2 dialog completion, Part 3 multiple choice). start_vfr_rt_exam_session
-- (mig 099) reads parts_config when present and falls back to its built-in
-- briefing-package defaults (8/9/8 with the seeded topic codes) when the
-- object is empty. No backfill: existing rows keep the empty-object default
-- and the existing mock_exam flow never reads this column.

ALTER TABLE exam_configs
  ADD COLUMN parts_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN exam_configs.parts_config IS
  'Per-part exam composition: { "part1": { "topic_code": text, "count": int }, "part2": { "topic_code": text, "count": int }, "part3": { "topic_code": text, "count": int } }. Empty object {} = the start RPC uses its built-in defaults (8/9/8 over the seeded VFR RT topic codes).';

-- POST-DEPLOY SEED EXAMPLE (do not auto-run):
-- This migration deliberately seeds NO exam_configs row. exam_configs is
-- tenant-scoped (UNIQUE (organization_id, subject_id)), and a one-shot
-- migration cannot pick org-specific UUIDs portably across environments.
-- Seeding the VFR RT exam config is a per-org post-deploy ops step (Supabase
-- SQL editor or a one-off script) — and it is OPTIONAL: the mig 099 RPC has
-- hardcoded 8/9/8 defaults, so run this only for an org that wants VFR RT
-- enabled with an explicit/overridable config row.
--
--   INSERT INTO exam_configs
--     (organization_id, subject_id, enabled, total_questions,
--      time_limit_seconds, pass_mark, parts_config)
--   SELECT
--     o.id,
--     s.id,
--     true,
--     25,    -- 8 + 9 + 8
--     1800,  -- 30 minutes
--     75,
--     '{
--       "part1": { "topic_code": "P1_ACRONYMS", "count": 8 },
--       "part2": { "topic_code": "P2_DIALOG",   "count": 9 },
--       "part3": { "topic_code": "P3_MC",       "count": 8 }
--     }'::jsonb
--   FROM organizations o, easa_subjects s
--   WHERE o.name = '<ORG NAME HERE>'
--     AND o.deleted_at IS NULL
--     AND s.code = 'RT'
--   ON CONFLICT (organization_id, subject_id) DO NOTHING;
