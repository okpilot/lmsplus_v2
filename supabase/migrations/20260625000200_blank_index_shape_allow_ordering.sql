-- Migration 135: widen the blank_index write-invariant to admit the `ordering`
-- question type (VFR RT Training Phase 5 — #697).
--
-- mig 131 added enforce_answer_blank_index_shape() — a BEFORE INSERT trigger on
-- quiz_session_answers + student_responses enforcing the biconditional
--   question_type = 'dialog_fill'  <=>  blank_index IS NOT NULL
-- so a stray/missing blank_index is rejected at write time (the single-row
-- *_answer_shape_check CHECK cannot read question_type from another table).
--
-- Phase 5 stores `ordering` answers as PER-SLOT rows (one row per sequence
-- position, blank_index = slot, response_text = the item text placed there —
-- the same multi-row shape as dialog_fill, so partial credit flows through the
-- existing DISTINCT-question rollup in batch_submit_quiz; see Decision 49 + the
-- spec N7 deviation note). Those rows carry a NON-NULL blank_index for a
-- NON-dialog_fill type, which the mig-131 ELSE branch rejects with
-- check_violation — an EXECUTION-time failure invisible to `db reset`.
--
-- FIX: widen the biconditional to
--   question_type IN ('dialog_fill','ordering')  <=>  blank_index IS NOT NULL
-- MC + short_answer still require blank_index IS NULL (the ELSE branch). Only the
-- trigger FUNCTION changes (CREATE OR REPLACE); the two triggers reference it by
-- name and are untouched. SECURITY INVOKER + no deleted_at filter (§15 frozen-config
-- carve-out) preserved verbatim from mig 131 — see that migration's header.

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

  IF v_question_type IN ('dialog_fill', 'ordering') THEN
    IF NEW.blank_index IS NULL THEN
      RAISE EXCEPTION
        'blank_index is required for % answers (question %)',
        v_question_type, NEW.question_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.blank_index IS NOT NULL THEN
      RAISE EXCEPTION
        'blank_index must be NULL for non-dialog_fill/ordering answers (question %, type %)',
        NEW.question_id, coalesce(v_question_type, 'unknown')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
