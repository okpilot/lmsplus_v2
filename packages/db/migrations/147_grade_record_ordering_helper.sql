-- Migration 147: _grade_record_ordering — internal per-slot grade+record helper
-- for the `ordering` question type (VFR RT Training Phase 5 — #697). Sibling of
-- the mig 120 helpers (_grade_record_mc/_short_answer/_dialog_fill).
--
-- The dispatcher (batch_submit_quiz, mig 148) fans out one entry per sequence
-- slot and calls this once per slot — one quiz_session_answers row per slot,
-- exactly like _grade_record_dialog_fill. Per-slot rows let the DISTINCT-question
-- rollup in the dispatcher award partial credit (correct slots / total items)
-- through the SAME machinery as dialog_fill (Decision 51 / spec N7 deviation).
--
-- SECURITY — REVOKE FROM PUBLIC, anon, authenticated (the mig 120 pattern; see
-- that file's header). This helper TRUSTS its p_student_id/p_session_id/p_org_id
-- args and carries NO auth.uid() check of its own — the dispatcher is the single
-- authorization boundary (Decision 47). `CREATE FUNCTION` grants EXECUTE to PUBLIC
-- by default AND Supabase separately grants anon/authenticated via ALTER DEFAULT
-- PRIVILEGES, so REVOKE FROM PUBLIC alone is INSUFFICIENT — every API role must be
-- named. DO NOT add GRANT EXECUTE ... TO anon/authenticated.
--
-- Storage shape: response_text = the TEXT of the item the student placed at this
-- slot (resolved from ordering_items by the submitted id), blank_index = the slot,
-- NO selected_option_id (its IN('a','b','c','d') CHECK would reject an item id).
-- This satisfies quiz_session_answers_answer_shape_check branch 2 (mig 095) only
-- if response_text is non-null — guarded below.

CREATE OR REPLACE FUNCTION _grade_record_ordering(
  p_session_id     uuid,
  p_student_id     uuid,
  p_org_id         uuid,
  p_question_id    uuid,
  p_slot           int,
  p_item_id        text,
  p_ordering_items jsonb,
  p_response_time  int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n            int;
  v_canonical_id text;
  v_resolved_text text;
  v_is_correct   boolean;
BEGIN
  -- Per-type correctness guards (dispatcher already verified auth/ownership/mode).
  v_n := jsonb_array_length(p_ordering_items);
  IF p_slot IS NULL OR p_slot < 0 OR p_slot >= v_n THEN
    RAISE EXCEPTION 'ordering slot % out of range for question %', p_slot, p_question_id;
  END IF;
  IF p_item_id IS NULL OR p_item_id = '' THEN
    RAISE EXCEPTION 'ordering entry for question % has empty item id', p_question_id;
  END IF;

  -- Canonical item id that BELONGS at this slot (canonical = array order).
  v_canonical_id := p_ordering_items->p_slot->>'id';

  -- Resolve the submitted id to its display text; a submitted id absent from
  -- ordering_items is a forged/garbage payload — reject it.
  SELECT e->>'text'
  INTO v_resolved_text
  FROM jsonb_array_elements(p_ordering_items) AS e
  WHERE e->>'id' = p_item_id
  LIMIT 1;

  IF v_resolved_text IS NULL OR v_resolved_text = '' THEN
    RAISE EXCEPTION 'ordering item id % not found (or empty text) in question %',
      p_item_id, p_question_id;
  END IF;

  v_is_correct := (p_item_id = v_canonical_id);

  -- One row per slot — blank_index is the differentiator in the 3-col UNIQUE.
  -- NO selected_option_id (item ids are not a-d letters). response_text = item text.
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, v_resolved_text, p_slot, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     v_resolved_text, p_slot, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke anon/authenticated PostgREST access (Supabase default-grants
-- both via ALTER DEFAULT PRIVILEGES) — the dispatcher calls this as the postgres
-- owner. See file-header note + mig 120.
REVOKE EXECUTE ON FUNCTION _grade_record_ordering(uuid,uuid,uuid,uuid,int,text,jsonb,int) FROM PUBLIC, anon, authenticated;
