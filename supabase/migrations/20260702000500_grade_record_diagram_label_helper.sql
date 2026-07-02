-- Migration 154: _grade_record_diagram_label — internal per-zone grade+record
-- helper for the `diagram_label` question type (VFR RT Training Phase 6 —
-- #697). Sibling of the mig 120 helpers (_grade_record_mc/_short_answer/
-- _dialog_fill) and mig 147 (_grade_record_ordering).
--
-- The dispatcher (batch_submit_quiz, mig 155) fans out one entry per submitted
-- zone placement and calls this once per zone — one quiz_session_answers row
-- per zone, exactly like _grade_record_ordering's per-slot rows. Per-zone rows
-- let the DISTINCT-question rollup in the dispatcher award partial credit
-- (correct zones / total zones) through the SAME machinery as dialog_fill /
-- ordering.
--
-- blank_index is DERIVED here, NOT client-supplied: it is the 0-based ordinal
-- position of p_zone_id within p_diagram_config.zones — the SAME single
-- ordinal source get_report_answer_keys (mig 156) uses, so the two agree by
-- construction. The dispatcher's client-supplied blank_index (if any) exists
-- only to satisfy the (question_id, blank_index) dup-guard upstream and is
-- otherwise DISCARDED — this function is the sole ordinal authority.
--
-- SECURITY — REVOKE FROM PUBLIC, anon, authenticated (the mig 120 pattern; see
-- that file's header, and mig 147's). This helper TRUSTS its
-- p_student_id/p_session_id/p_org_id args and carries NO auth.uid() check of
-- its own — the dispatcher is the single authorization boundary (Decision 47).
-- `CREATE FUNCTION` grants EXECUTE to PUBLIC by default AND Supabase
-- separately grants anon/authenticated via ALTER DEFAULT PRIVILEGES, so
-- REVOKE FROM PUBLIC alone is INSUFFICIENT — every API role must be named.
-- DO NOT add GRANT EXECUTE ... TO anon/authenticated.
--
-- Storage shape: response_text = the TEXT of the label the student placed on
-- this zone (resolved from diagram_config.labels by the submitted label id),
-- blank_index = the derived zone ordinal, NO selected_option_id (its
-- IN('a','b','c','d') CHECK would reject a label id). This satisfies
-- quiz_session_answers_answer_shape_check branch 2 (mig 095) only if
-- response_text is non-null — guarded below.

CREATE OR REPLACE FUNCTION _grade_record_diagram_label(
  p_session_id      uuid,
  p_student_id      uuid,
  p_org_id          uuid,
  p_question_id     uuid,
  p_zone_id         text,
  p_label_id        text,
  p_diagram_config  jsonb,
  p_response_time   int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n_zones            int;
  v_zone_index         int;
  v_label_text         text;
  v_canonical_label_id text;
  v_is_correct         boolean;
BEGIN
  v_n_zones := jsonb_array_length(p_diagram_config->'zones');

  -- Resolve the submitted zone id to its 0-based ordinal position (the
  -- SINGLE ordinal source — mig 156 derives the same value the same way).
  -- A null/empty/forged p_zone_id matches no row and falls through to NOT FOUND.
  SELECT (ord.idx - 1)
  INTO v_zone_index
  FROM jsonb_array_elements(p_diagram_config->'zones') WITH ORDINALITY AS ord(elem, idx)
  WHERE ord.elem->>'id' = p_zone_id
  LIMIT 1;

  IF v_zone_index IS NULL THEN
    RAISE EXCEPTION 'diagram zone id % not found in question %', p_zone_id, p_question_id;
  END IF;

  -- Defensive parity with _grade_record_ordering's slot bounds check — should
  -- be unreachable given the lookup above (idx ranges 1..v_n_zones), but kept
  -- as an explicit invariant guard.
  IF v_zone_index < 0 OR v_zone_index >= v_n_zones THEN
    RAISE EXCEPTION 'diagram zone % out of range for question %', p_zone_id, p_question_id;
  END IF;

  -- Resolve the submitted label id to its display text; a submitted id absent
  -- from diagram_config.labels is a forged/garbage payload — reject it.
  SELECT lbl->>'text'
  INTO v_label_text
  FROM jsonb_array_elements(p_diagram_config->'labels') AS lbl
  WHERE lbl->>'id' = p_label_id
  LIMIT 1;

  IF v_label_text IS NULL OR v_label_text = '' THEN
    RAISE EXCEPTION 'diagram label id % not found (or empty text) in question %',
      p_label_id, p_question_id;
  END IF;

  -- Canonical label id for this zone (from diagram_config.answer). No match
  -- means the config itself omits this zone from its answer array, which
  -- is_valid_diagram_config (mig 150) already prevents at write time — so this
  -- is always found for a valid question row. The IS NOT NULL guard on the
  -- comparison below is defense-in-depth: were v_canonical_label_id ever NULL,
  -- the three-valued `p_label_id = NULL` would evaluate to NULL (not false), so
  -- we pin the result to false explicitly rather than lean on the write-time
  -- invariant (Phase 2 lesson (d) — NULL propagating into a NOT NULL column).
  SELECT ca->>'label_id'
  INTO v_canonical_label_id
  FROM jsonb_array_elements(p_diagram_config->'answer') AS ca
  WHERE ca->>'zone_id' = p_zone_id
  LIMIT 1;

  v_is_correct := (v_canonical_label_id IS NOT NULL AND p_label_id = v_canonical_label_id);

  -- One row per zone — blank_index (the derived zone ordinal) is the
  -- differentiator in the 3-col UNIQUE. NO selected_option_id (label ids are
  -- not a-d letters). response_text = label text.
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, v_label_text, v_zone_index, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     v_label_text, v_zone_index, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke anon/authenticated PostgREST access (Supabase default-grants
-- both via ALTER DEFAULT PRIVILEGES) — the dispatcher calls this as the postgres
-- owner. See file-header note + mig 120/147.
REVOKE EXECUTE ON FUNCTION _grade_record_diagram_label(uuid,uuid,uuid,uuid,text,text,jsonb,int) FROM PUBLIC, anon, authenticated;
