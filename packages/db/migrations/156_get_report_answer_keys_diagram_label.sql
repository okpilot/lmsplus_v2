-- Migration 156: get_report_answer_keys reveals the `diagram_label` canonical
-- zone->label mapping in the post-session report (VFR RT Training Phase 6 —
-- #697). Body is mig 149's (the latest definition) with ONE added RETURN
-- QUERY branch for diagram_label; every guard + existing branch is re-emitted
-- verbatim. RETURNS TABLE unchanged → CREATE OR REPLACE (no DROP).
--
-- diagram_label: ONE row PER ZONE — blank_index = the zone's 0-based ordinal
-- position within diagram_config.zones (WITH ORDINALITY gives a 1-based idx
-- -> blank_index = idx - 1), the SAME index _grade_record_diagram_label (mig
-- 154) derives, so report rows line up with quiz_session_answers.blank_index
-- by construction. answer_key is a 2-HOP RESOLVE (NOT a single-expression
-- projection like ordering's `elem->>'text'`, because the canonical answer
-- for a zone is not embedded in the zone object itself):
--   zone (ord.elem, at this ordinal) --id-->
--   diagram_config.answer entry matching zone_id --label_id-->
--   diagram_config.labels entry matching that label_id --text.
-- diagram_config is REVOKE-gated from authenticated (mig 150 header, omission
-- from mig 094's grant, mirrors ordering_items N6). SECURITY DEFINER bypasses
-- that — gated to the owning student's own COMPLETED session, like the
-- sibling branches.
--
-- §15 carve-out: no q.deleted_at filter on the questions JOIN — quiz_session_answers
-- is immutable/append-only so sa.question_id is a write-once FK (see mig 133 header,
-- docs/security.md §15, docs/database.md §3).
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

  -- Active-user gate (mirrors get_report_correct_options, mig 114).
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

  -- short_answer: ONE row per question.
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

  -- dialog_fill: ONE row PER BLANK.
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

  -- ordering: ONE row PER SLOT — answer_key = canonical item text at that slot.
  RETURN QUERY
  SELECT DISTINCT ON (q.id, ord.idx)
    q.id              AS question_id,
    q.question_type   AS question_type,
    (ord.idx - 1)::int AS blank_index,
    ord.elem->>'text' AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.ordering_items) WITH ORDINALITY AS ord(elem, idx)
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'ordering'
  ORDER BY q.id, ord.idx;

  -- diagram_label: ONE row PER ZONE — answer_key = the display TEXT of the
  -- label canonically assigned to that zone. 2-hop resolve: zone -> the
  -- diagram_config.answer entry for this zone_id -> its label_id -> that
  -- label's text in diagram_config.labels.
  RETURN QUERY
  SELECT DISTINCT ON (q.id, ord.idx)
    q.id              AS question_id,
    q.question_type   AS question_type,
    (ord.idx - 1)::int AS blank_index,
    (
      SELECT lbl->>'text'
      FROM jsonb_array_elements(q.diagram_config->'labels') AS lbl
      WHERE lbl->>'id' = (
        SELECT ca->>'label_id'
        FROM jsonb_array_elements(q.diagram_config->'answer') AS ca
        WHERE ca->>'zone_id' = ord.elem->>'id'
        LIMIT 1
      )
      LIMIT 1
    ) AS answer_key
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.diagram_config->'zones') WITH ORDINALITY AS ord(elem, idx)
  WHERE sa.session_id = p_session_id
    AND q.question_type = 'diagram_label'
  ORDER BY q.id, ord.idx;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_answer_keys(uuid) TO authenticated;
