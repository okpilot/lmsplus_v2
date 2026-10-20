-- #1549: _answer_feedback(question row, stored answer) -> immediate-feedback jsonb. The one grading
-- body shared by its callers: check_quiz_answer (20261020000600), check_non_mc_answer
-- (20261020000400; non-MC branches moved verbatim from 20261002000800) and get_restored_feedback
-- (20261020000500). Reads no table: the caller fetches the question row (under its own membership /
-- §15 guards) and passes the stored answer in the _validate_progress_answer shape. Internal:
-- EXECUTE revoked from every API role.

CREATE OR REPLACE FUNCTION _answer_feedback(p_q public.questions, p_answer jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_response_text    text;
  v_blank_answers    jsonb;
  v_order            jsonb;
  v_mapping          jsonb;
  v_is_correct       boolean;
  v_blank_entry      jsonb;
  v_blank_index      int;
  v_blank_canonical  text;
  v_blank_synonyms   text[];
  v_blank_correct    boolean;
  v_all_correct      boolean;
  v_norm             text;
  v_n                int;
  v_i                int;
  v_correct_order    jsonb;
  v_correct_mapping  jsonb;
  v_blank_results    jsonb;
  v_blank_result_row jsonb;
BEGIN
  IF p_q.question_type = 'multiple_choice' THEN
    IF p_q.correct_option_id IS NULL THEN
      RAISE EXCEPTION 'question not found or has no correct option';
    END IF;
    RETURN jsonb_build_object(
      'is_correct',           ((p_answer->>'selected_option_id') = p_q.correct_option_id),
      'correct_option_id',    p_q.correct_option_id,
      'explanation_text',     p_q.explanation_text,
      'explanation_image_url', p_q.explanation_image_url
    );

  ELSIF p_q.question_type = 'short_answer' THEN
    v_response_text := p_answer->>'response_text';
    IF v_response_text IS NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF p_q.canonical_answer IS NULL THEN
      RAISE EXCEPTION 'question_missing_canonical_answer';
    END IF;

    -- §5(d) / #950: coalesce at the call site, matching migs 158 and 160.
    v_norm       := coalesce(normalize_answer(v_response_text), '');
    v_is_correct := (v_norm <> '' AND (
      public.answer_matches(v_norm, p_q.canonical_answer)
      OR EXISTS (
        SELECT 1 FROM unnest(p_q.accepted_synonyms) AS s
        WHERE public.answer_matches(v_norm, s)
      )
    ));

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       p_q.canonical_answer,
      'blanks',               NULL,
      'correct_order',        NULL,
      'correct_mapping',      NULL,
      'explanation_text',     p_q.explanation_text,
      'explanation_image_url', p_q.explanation_image_url
    );

  ELSIF p_q.question_type = 'dialog_fill' THEN
    v_blank_answers := p_answer->'blanks';
    IF v_blank_answers IS NULL OR jsonb_typeof(v_blank_answers) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    v_blank_results := '[]'::jsonb;
    v_all_correct   := true;

    FOR v_blank_entry IN SELECT * FROM jsonb_array_elements(v_blank_answers)
    LOOP
      IF jsonb_typeof(v_blank_entry) <> 'object' THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      IF (v_blank_entry->>'blank_index') IS NULL
         OR (v_blank_entry->>'blank_index') !~ '^\d{1,4}$' THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      v_blank_index := (v_blank_entry->>'blank_index')::int;

      SELECT
        b->>'canonical',
        ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
      INTO v_blank_canonical, v_blank_synonyms
      FROM jsonb_array_elements(p_q.blanks_config) AS b
      WHERE (b->>'index')::int = v_blank_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      IF v_blank_canonical IS NULL THEN
        RAISE EXCEPTION 'question_blank_missing_canonical';
      END IF;

      -- Coalesce the OUTPUT, matching the short_answer branch above and migs 158/160.
      v_norm        := coalesce(normalize_answer(coalesce(v_blank_entry->>'response_text', '')), '');
      v_blank_correct := (v_norm <> '' AND (
        public.answer_matches(v_norm, v_blank_canonical)
        OR EXISTS (
          SELECT 1 FROM unnest(v_blank_synonyms) AS s
          WHERE public.answer_matches(v_norm, s)
        )
      ));

      IF NOT v_blank_correct THEN
        v_all_correct := false;
      END IF;

      v_blank_result_row := jsonb_build_object(
        'index',      v_blank_index,
        'is_correct', v_blank_correct,
        'canonical',  v_blank_canonical
      );
      v_blank_results := v_blank_results || jsonb_build_array(v_blank_result_row);
    END LOOP;

    v_is_correct := v_all_correct AND (
      SELECT count(DISTINCT (e->>'blank_index')::int)
      FROM jsonb_array_elements(v_blank_answers) AS e
      WHERE (e->>'blank_index') ~ '^\d{1,4}$'
    ) = jsonb_array_length(p_q.blanks_config);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               v_blank_results,
      'correct_order',        NULL,
      'correct_mapping',      NULL,
      'explanation_text',     p_q.explanation_text,
      'explanation_image_url', p_q.explanation_image_url
    );

  ELSIF p_q.question_type = 'ordering' THEN
    v_order := p_answer->'order';
    IF v_order IS NULL OR jsonb_typeof(v_order) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- Correct iff the submitted id sequence equals the canonical array order of ordering_items,
    -- element for element (full coverage — partial credit is a batch-submit / report concern).
    v_n          := jsonb_array_length(p_q.ordering_items);
    v_is_correct := (jsonb_array_length(v_order) = v_n);
    IF v_is_correct THEN
      FOR v_i IN 0 .. v_n - 1 LOOP
        IF (v_order->>v_i) IS DISTINCT FROM (p_q.ordering_items->v_i->>'id') THEN
          v_is_correct := false;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Revealed canonical order = the item IDs in canonical array order (ids are unambiguous; two
    -- items may share display text).
    SELECT jsonb_agg(ord.elem->>'id' ORDER BY ord.idx)
    INTO v_correct_order
    FROM jsonb_array_elements(p_q.ordering_items) WITH ORDINALITY AS ord(elem, idx);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               NULL,
      'correct_order',        v_correct_order,
      'correct_mapping',      NULL,
      'explanation_text',     p_q.explanation_text,
      'explanation_image_url', p_q.explanation_image_url
    );

  ELSIF p_q.question_type = 'diagram_label' THEN
    v_mapping := p_answer->'mapping';
    IF v_mapping IS NULL OR jsonb_typeof(v_mapping) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- Every element must be an object: a scalar element would resolve pm->>'zone_id' to NULL and
    -- grade as a silent wrong answer instead of a clean rejection.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_mapping) AS pm
      WHERE jsonb_typeof(pm) <> 'object'
    ) THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- SET comparison: every zone covered exactly once, every pair matches the canonical answer.
    v_n          := jsonb_array_length(p_q.diagram_config->'answer');
    v_is_correct := (
      jsonb_array_length(v_mapping) = v_n
      AND (
        SELECT count(DISTINCT pm->>'zone_id')
        FROM jsonb_array_elements(v_mapping) AS pm
      ) = v_n
      AND (
        SELECT count(*)
        FROM jsonb_array_elements(v_mapping) AS pm
        WHERE NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_q.diagram_config->'answer') AS ca
          WHERE ca->>'zone_id'  = pm->>'zone_id'
            AND ca->>'label_id' = pm->>'label_id'
        )
      ) = 0
    );

    -- Revealed canonical mapping = the raw {zone_id,label_id} answer array.
    v_correct_mapping := p_q.diagram_config->'answer';

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               NULL,
      'correct_order',        NULL,
      'correct_mapping',      v_correct_mapping,
      'explanation_text',     p_q.explanation_text,
      'explanation_image_url', p_q.explanation_image_url
    );
  END IF;

  RAISE EXCEPTION 'unsupported_question_type';
END;
$$;

REVOKE EXECUTE ON FUNCTION _answer_feedback(public.questions, jsonb) FROM PUBLIC, anon, authenticated;
-- Explicit: default privileges do not supply service_role EXECUTE (see 20260815000100).
GRANT  EXECUTE ON FUNCTION _answer_feedback(public.questions, jsonb) TO service_role;

COMMENT ON FUNCTION _answer_feedback(public.questions, jsonb) IS
  'Immediate-feedback grading of one stored answer (shape per _validate_progress_answer) against a questions row. Reads no table. Shared by check_quiz_answer, check_non_mc_answer and get_restored_feedback.';
