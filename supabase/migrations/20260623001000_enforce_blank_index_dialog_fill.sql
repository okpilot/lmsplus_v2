-- Migration 131: enforce the blank_index ⇔ dialog_fill invariant at write time (#828).
--
-- The answer tables (quiz_session_answers, student_responses) carry blank_index
-- (added mig 095) which must be NON-NULL for exactly one question type —
-- dialog_fill (one row per blank) — and NULL for every other type
-- (multiple_choice, short_answer). Today that binding is enforced only
-- procedurally inside the grading RPCs: each inserter sets blank_index from the
-- question's type before writing. The existing *_answer_shape_check CHECK
-- (mig 095) constrains the column COMBINATION (selected_option_id XOR
-- response_text; blank_index >= 0 when set) but CANNOT see question_type — a
-- CHECK is single-row and cannot read another table. So a future inserter (or an
-- admin-form / import bug) could persist a short_answer row with a stray
-- blank_index, or a dialog_fill row missing its blank_index, and no constraint
-- would catch it. That is the gap this migration closes.
--
-- FIX: a BEFORE INSERT trigger on each answer table that reads the answered
-- question's type and enforces the biconditional
--   question_type = 'dialog_fill'  <=>  blank_index IS NOT NULL
-- raising on any violation. One shared trigger function, two triggers (one per
-- table). BEFORE triggers fire ahead of CHECK evaluation, so a malformed row is
-- rejected by whichever fires first; the trigger covers exactly the cross-table
-- case the CHECK structurally cannot.
--
-- SECURITY INVOKER (the repo trigger convention — see
-- stamp_last_active_on_session_complete mig 092 and protect_users_sensitive_columns):
-- every INSERT into these two tables originates inside a SECURITY DEFINER
-- answer-grading RPC owned by postgres (submit_quiz_answer, batch_submit_quiz +
-- its _grade_record_* helpers, submit_vfr_rt_exam_answers), so the trigger body
-- runs as postgres and the questions read bypasses RLS (questions.tenant_isolation)
-- — no row is filtered out. DEFINER would add a needless security surface with no
-- benefit, since the firing context is already postgres.
--
-- NO deleted_at filter on the questions read: the question is reached via the
-- session's frozen, write-once config.question_ids, and soft-deleted questions
-- are still scored (docs/security.md §15 frozen-config carve-out; docs/database.md
-- §3 "Scoring Soft-Deleted Questions"). A hard-deleted question is impossible here
-- — both answer tables FK question_id -> questions(id) — so the no-match case
-- (v_question_type NULL) cannot occur. Were it to, NULL is not 'dialog_fill', so
-- the ELSE branch requires blank_index IS NULL, the safe default.
--
-- WRITE-INVARIANT, NOT user-callable: a trigger has no auth.uid() requirement
-- (security.md rule 7 targets user-callable SECURITY DEFINER RPCs) and needs no
-- GRANT EXECUTE (trigger functions are not reachable via PostgREST). BEFORE INSERT
-- only — existing rows are untouched and need no backfill.

CREATE OR REPLACE FUNCTION public.enforce_answer_blank_index_shape()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_question_type text;
BEGIN
  SELECT q.question_type INTO v_question_type
  FROM questions q
  WHERE q.id = NEW.question_id;

  IF v_question_type = 'dialog_fill' THEN
    IF NEW.blank_index IS NULL THEN
      RAISE EXCEPTION
        'blank_index is required for dialog_fill answers (question %)', NEW.question_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.blank_index IS NOT NULL THEN
      RAISE EXCEPTION
        'blank_index must be NULL for non-dialog_fill answers (question %, type %)',
        NEW.question_id, coalesce(v_question_type, 'unknown')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_blank_index_shape_qsa ON public.quiz_session_answers;
CREATE TRIGGER trg_enforce_blank_index_shape_qsa
BEFORE INSERT ON public.quiz_session_answers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_answer_blank_index_shape();

DROP TRIGGER IF EXISTS trg_enforce_blank_index_shape_sr ON public.student_responses;
CREATE TRIGGER trg_enforce_blank_index_shape_sr
BEFORE INSERT ON public.student_responses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_answer_blank_index_shape();
