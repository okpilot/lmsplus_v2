-- Migration 094: questions.question_type + answer-key columns for the VFR RT
-- mock exam, with a column-level SELECT gate on the new answer-key columns
-- (#697, Phase A.1).
--
-- The VFR RT (Slovenia) mock exam introduces two new question types alongside
-- the existing multiple-choice bank:
--   * short_answer — graded against canonical_answer + accepted_synonyms
--   * dialog_fill  — an ATC/pilot dialog template with {{n|canonical; syn}}
--                    blanks; per-blank keys live in blanks_config
--
-- question_type is TEXT + CHECK (matching the existing mode/status pattern,
-- mig 058 / mig 001) rather than a Postgres ENUM.
--
-- The type<->column discriminator CHECK positively states which columns ARE
-- and ARE NOT set in EVERY branch, so accidental cross-contamination (e.g. an
-- admin-form bug saving a canonical_answer on a dialog_fill question) is
-- rejected at the database layer. Existing rows pass the multiple_choice
-- branch: ADD COLUMN ... NOT NULL DEFAULT backfills canonical_answer = NULL,
-- dialog_template = NULL, blanks_config = '[]' (length 0).
--
-- SECURITY (the REVOKE/GRANT block below). The `tenant_isolation` RLS policy
-- on questions (mig 001 line 329) is org-scoped, not role-scoped — a same-org
-- STUDENT passes it, so without a privilege-layer gate a student's direct
-- PostgREST SELECT would read the answer key pre-submit (security.md rule 1).
-- RLS cannot express column restrictions; fix at the privilege layer using
-- the #611 pattern (mig 20260605000001, quiz_sessions UPDATE column grant):
-- REVOKE the blanket SELECT from authenticated and re-GRANT every column
-- EXCEPT the four answer-key columns:
--
--   * canonical_answer, accepted_synonyms, blanks_config — the grading keys.
--   * dialog_template is also revoked: its raw {{n|canonical; syn}} tokens
--     embed the canonical strings.
--
-- Consequences:
--   * Any select('*') / select=* on questions from an authenticated client
--     (admin OR student) now fails with 42501. The A.1 call-site audit
--     confirmed every production .from('questions') select uses an explicit
--     column list excluding the four revoked columns.
--   * Admins share the `authenticated` role, so the REVOKE blocks them too —
--     by design. Admin authoring reads of the four columns go through the
--     is_admin()-gated get_question_authoring_fields() RPC (mig 094b).
--   * SECURITY DEFINER RPCs (get_quiz_questions, the VFR RT RPCs) are owned
--     by postgres, which is not subject to the authenticated column grant —
--     server-side grading and question delivery are unaffected.
--   * service_role keeps its table-level SELECT (Supabase default privileges;
--     untouched here, matching mig 20260605000001) — admin/seed scripts via
--     packages/db/src/admin.ts are unaffected.
--   * anon also keeps its default table-level SELECT — REVOKE ... FROM
--     authenticated does not touch it. anon has auth.uid() = NULL, so the
--     FORCEd tenant_isolation policy returns zero rows; noted for
--     defense-in-depth awareness, not changed here (matches the #611
--     precedent, which also left anon grants alone).
--
-- The pre-existing exposure of options[].correct (the MC answer key inside
-- the options JSONB, which column grants cannot reach) is a platform-wide
-- issue tracked separately — intentionally NOT addressed in this migration.

-- ------------------------------------------------------------------
-- 1) New columns
-- ------------------------------------------------------------------
ALTER TABLE questions
  ADD COLUMN question_type TEXT NOT NULL DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice', 'short_answer', 'dialog_fill'));

-- Used by short_answer.
ALTER TABLE questions
  ADD COLUMN canonical_answer TEXT NULL;

ALTER TABLE questions
  ADD COLUMN accepted_synonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- Used by dialog_fill: raw template with [atc]/[pilot] speaker tags and
-- {{n|canonical; var1; var2}} blank tokens.
ALTER TABLE questions
  ADD COLUMN dialog_template TEXT NULL;

-- Used by dialog_fill: ordered array of
-- { index: int, canonical: text, synonyms: text[] }.
ALTER TABLE questions
  ADD COLUMN blanks_config JSONB NOT NULL DEFAULT '[]'::JSONB;

-- ------------------------------------------------------------------
-- 2) options default
-- ------------------------------------------------------------------
-- options is NOT NULL with no default (mig 001 line 115); short_answer /
-- dialog_fill INSERTs that omit it would fail otherwise. MC INSERTs continue
-- to supply their own options array, unaffected.
ALTER TABLE questions
  ALTER COLUMN options SET DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------------
-- 3) Type <-> column population discriminator
-- ------------------------------------------------------------------
ALTER TABLE questions
  ADD CONSTRAINT questions_question_type_columns_check CHECK (
    (question_type = 'multiple_choice'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0)
    OR (question_type = 'short_answer'
       AND canonical_answer IS NOT NULL
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0)
    OR (question_type = 'dialog_fill'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NOT NULL
       AND jsonb_array_length(blanks_config) > 0)
  );

-- ------------------------------------------------------------------
-- 4) Sampler index
-- ------------------------------------------------------------------
-- Supports the VFR RT sampler's per-part pools:
-- WHERE question_type = X AND subject_id = Y on active, non-deleted rows.
CREATE INDEX idx_questions_type_subject
  ON questions (question_type, subject_id)
  WHERE deleted_at IS NULL AND status = 'active';

-- ------------------------------------------------------------------
-- 5) Column-level SELECT gate on the four answer-key columns
-- ------------------------------------------------------------------
-- Postgres cannot REVOKE a single column from a table-level grant, so we
-- REVOKE the blanket SELECT and re-GRANT every column EXCEPT
-- canonical_answer, accepted_synonyms, dialog_template, blanks_config.
-- Column list verified against mig 001 (questions table, 20 columns) +
-- mig 002 (question_number) + question_type added above — no other
-- ALTER TABLE questions ADD COLUMN exists as of this migration.
REVOKE SELECT ON questions FROM authenticated;
GRANT SELECT (
  id,
  organization_id,
  bank_id,
  subject_id,
  topic_id,
  subtopic_id,
  lo_reference,
  question_number,
  question_text,
  question_image_url,
  options,
  explanation_text,
  explanation_image_url,
  difficulty,
  status,
  version,
  question_type,
  created_by,
  deleted_at,
  deleted_by,
  created_at,
  updated_at
) ON questions TO authenticated;
