-- Migration 116: get_question_authoring_fields exposes correct_option_id to admins
-- (#823, P0 security). Companion to mig 20260619000100, which relocated the MC answer key
-- into the REVOKE-gated questions.correct_option_id column (not granted to authenticated).
-- The admin question editor must read the key to edit existing multiple_choice questions,
-- but a direct PostgREST SELECT on correct_option_id raises 42501 by design — this
-- SECURITY DEFINER RPC (owned by postgres) is the only authenticated read path. Body copied
-- VERBATIM from the latest definition (20260610000200); the ONLY changes add
-- correct_option_id to the RETURNS TABLE and to the SELECT. All is_admin()/auth/org/
-- soft-delete guards and existing columns are preserved. Depends on 20260619000100
-- (correct_option_id column). NOTE: packages/db/src/types.ts get_question_authoring_fields
-- Returns type must add `correct_option_id: string | null` — handled in the separate app task.

-- Migration 094b: get_question_authoring_fields() — admin read path for the
-- four answer-key columns revoked in mig 094 (#697, Phase A.1b).
--
-- Companion to mig 094's column-level SELECT REVOKE on questions. The admin
-- question editor must read canonical_answer / accepted_synonyms /
-- dialog_template / blanks_config to edit existing short_answer and
-- dialog_fill questions, but admins share the `authenticated` role, so the
-- mig 094 REVOKE blocks their direct PostgREST SELECT too (42501) — by
-- design. This SECURITY DEFINER RPC (owned by postgres, not subject to the
-- column grant) is the ONLY authenticated read path for those columns.
--
-- Security model (the RPC is EXECUTE-granted to authenticated, so it must be
-- self-defending):
--   * auth.uid() NULL check + is_admin() check (security.md §7) — a student
--     caller is rejected with 'forbidden' before any row is read.
--   * Row lookup is scoped to the caller's own org, derived from auth.uid()
--     via a deleted_at-filtered users lookup — never from caller input — and
--     filters questions.deleted_at IS NULL (security.md §9). A cross-org
--     admin or a soft-deleted question yields zero rows.
--   * Returns ONLY the four answer-key columns for the single requested
--     question — no student-facing read path ever calls this (the Phase D
--     admin editor is the sole consumer).
--
-- LANGUAGE plpgsql (not sql) so the guards can RAISE, matching the
-- get_admin_dashboard_students precedent (mig 20260527000001).

-- RETURNS TABLE gains correct_option_id, so CREATE OR REPLACE alone raises
-- 42P13 ("cannot change return type of existing function"). Drop first, then
-- recreate and re-GRANT EXECUTE (the GRANT below restores it).
DROP FUNCTION IF EXISTS public.get_question_authoring_fields(UUID);

CREATE FUNCTION public.get_question_authoring_fields(p_question_id UUID)
RETURNS TABLE (
  canonical_answer  TEXT,
  accepted_synonyms TEXT[],
  dialog_template   TEXT,
  blanks_config     JSONB,
  correct_option_id TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_org_id UUID;
BEGIN
  -- Auth + admin check (security.md §7)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Resolve the caller's org (admin's own profile must be active).
  -- Org is derived from auth.uid(), never passed as a parameter.
  SELECT u.organization_id INTO v_org_id
  FROM users u
  WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Columns are table-qualified: all four are also RETURNS TABLE output
  -- variables, so bare references would be ambiguous (column vs OUT param).
  RETURN QUERY
  SELECT q.canonical_answer, q.accepted_synonyms, q.dialog_template, q.blanks_config, q.correct_option_id
  FROM questions q
  WHERE q.id = p_question_id
    AND q.organization_id = v_org_id
    AND q.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_question_authoring_fields(UUID) TO authenticated;
