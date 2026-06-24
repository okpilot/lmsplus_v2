-- Migration 133: get_report_answer_keys — non-MC answer-key delivery for the
-- post-session report (#697 VFR RT Training Phase 4). Type-aware sibling of
-- get_report_correct_options (mig 114): where that RPC delivers the MC key
-- (questions.correct_option_id), this one delivers the non-MC canonicals —
-- short_answer's questions.canonical_answer (one row per question) and
-- dialog_fill's per-blank canonicals from questions.blanks_config (one row per
-- blank). MC questions return NOTHING here (their keys come from
-- get_report_correct_options).
--
-- The answer-key columns (canonical_answer, blanks_config) are REVOKE-gated from
-- authenticated (mig 094). SECURITY DEFINER runs as postgres and bypasses that
-- column REVOKE, so this RPC can read them — gated to the owning student's own
-- COMPLETED session (ended_at IS NOT NULL) only, with the same guard set as the
-- MC sibling (security.md §11c sibling-guard consistency).
--
-- §15 carve-out: no q.deleted_at filter on the questions JOIN — quiz_session_answers
-- is immutable (append-only — no UPDATE/DELETE policies; resubmits are ON CONFLICT
-- DO NOTHING), so sa.question_id is a write-once FK: the question set is bounded by
-- the student's actual answers in a completed session (ended_at IS NOT NULL), not by
-- the deleted-at predicate. A question soft-deleted after it was answered must still
-- reveal its key in that historical report. See docs/security.md §15 and
-- docs/database.md §3 "Scoring Soft-Deleted Questions".
--
-- Column qualification: every body reference is table-qualified / aliased to the
-- RETURNS TABLE OUT params (question_id, question_type, blank_index, answer_key) to
-- avoid a deferred 42702 "ambiguous column" at execution (the failure class that bit
-- mig 118 get_quiz_questions).
CREATE OR REPLACE FUNCTION get_report_answer_keys(p_session_id uuid)
RETURNS TABLE (question_id uuid, question_type text, blank_index int, answer_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user gate: a soft-deleted caller with a still-valid JWT must not keep
  -- reading non-MC answer keys for their completed sessions. Mirrors
  -- get_report_correct_options (mig 114).
  PERFORM 1
  FROM users
  WHERE id = auth.uid()
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id
      AND student_id = auth.uid()
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Session not found, not owned, or not completed';
  END IF;

  -- Ownership verified above via EXISTS on quiz_sessions.
  -- This SECURITY DEFINER function bypasses RLS — do not remove the guard.
  --
  -- short_answer: ONE row per question (DISTINCT ON dedupes repeated answer rows
  -- for the same question within a session; canonical_answer is deterministic per
  -- question, so the dedupe is safe). blank_index is NULL for short_answer.
  RETURN QUERY
  SELECT DISTINCT ON (q.id)
    q.id              AS question_id,
    q.question_type   AS question_type,
    NULL::int         AS blank_index,
    q.canonical_answer AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'short_answer'
  ORDER BY q.id;

  -- dialog_fill: ONE row PER BLANK. blanks_config is a JSONB array
  -- [{index, canonical, synonyms[]}] (mig 119 check_non_mc_answer). Expand it with
  -- jsonb_array_elements; the per-blank key is b->>'index' / b->>'canonical' (NOT
  -- 'blank_index'). DISTINCT ON (question, blank index) dedupes repeated answer rows.
  RETURN QUERY
  SELECT DISTINCT ON (q.id, (b->>'index')::int)
    q.id            AS question_id,
    q.question_type AS question_type,
    (b->>'index')::int AS blank_index,
    b->>'canonical' AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.blanks_config) AS b
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'dialog_fill'
  ORDER BY q.id, (b->>'index')::int;
END;
$$;

-- Re-assert the student EXECUTE grant explicitly (CREATE OR REPLACE preserves the
-- prior grant on a no-DROP redefinition, but make it survive a future DROP+CREATE
-- and mirror get_report_correct_options).
GRANT EXECUTE ON FUNCTION public.get_report_answer_keys(uuid) TO authenticated;
