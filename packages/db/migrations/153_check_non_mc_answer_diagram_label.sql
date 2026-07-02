-- Migration 153: check_non_mc_answer grades the `diagram_label` type for
-- immediate feedback in practice sessions (VFR RT Training Phase 6 — #697).
-- Companion to mig 119 (short_answer + dialog_fill) and mig 146 (ordering).
--
-- Signature change: adds a trailing p_mapping jsonb param → DROP the old
-- 5-arg function first, then CREATE the 6-arg (CREATE OR REPLACE cannot
-- change the arg list; leaving the old overload alive would make calls
-- ambiguous). Every guard and the short_answer/dialog_fill/ordering branches
-- are re-emitted VERBATIM from mig 146 (the latest definition) — ONLY the
-- diagram_label branch + the diagram_config fetch + the p_mapping param are
-- new. The 4-way answer_type_mismatch parity below is maintained: EVERY
-- branch's mismatch guard now also rejects a non-NULL p_mapping when p_mapping
-- is not that branch's own param, and the new diagram_label branch requires
-- p_mapping NOT NULL with all three other payload params NULL.
--
-- Reveal model (unchanged from mig 119/146): returning the canonical mapping
-- on BOTH correct and incorrect answers is acceptable in practice mode — same
-- posture as short_answer/dialog_fill canonicals, check_quiz_answer's
-- correct_option_id, and ordering's correct_order. The practice-mode
-- whitelist (smart_review/quick_quiz) ensures this RPC can never be used as a
-- mid-exam answer oracle (exam grading is exam-RPC-only).
--
-- security.md rules 1, 7, 9, 11c. §15 carve-out on the question read preserved.

DROP FUNCTION IF EXISTS check_non_mc_answer(uuid, uuid, text, jsonb, jsonb);

CREATE FUNCTION check_non_mc_answer(
  p_question_id   uuid,
  p_session_id    uuid,
  p_response_text text  DEFAULT NULL,
  p_blank_answers jsonb DEFAULT NULL,
  p_order         jsonb DEFAULT NULL,
  p_mapping       jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id         uuid := auth.uid();
  v_config             jsonb;
  v_mode               text;
  v_session_question_ids uuid[];

  -- question fields
  v_qtype              text;
  v_canonical          text;
  v_synonyms           text[];
  v_blanks             jsonb;
  v_ordering_items     jsonb;
  v_diagram_config     jsonb;
  v_explanation_text   text;
  v_explanation_image  text;

  -- grading state
  v_is_correct         boolean;
  v_blank_entry        jsonb;
  v_blank_index        int;
  v_blank_canonical    text;
  v_blank_synonyms     text[];
  v_blank_correct      boolean;
  v_all_correct        boolean;
  v_norm               text;
  v_n                  int;
  v_i                  int;
  v_correct_order      jsonb;
  v_correct_mapping    jsonb;

  -- result accumulators
  v_blank_results      jsonb;
  v_blank_result_row   jsonb;
BEGIN
  -- ── 1. Auth guard ────────────────────────────────────────────────────────
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ── 2. Active-caller gate ────────────────────────────────────────────────
  PERFORM 1
  FROM users
  WHERE id = v_student_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- ── 3. Session ownership ─────────────────────────────────────────────────
  -- quiz_sessions has multiple permissive SELECT policies; the student_id
  -- predicate is mandatory (docs/security.md §3 / security.md rule 11).
  SELECT qs.config, qs.mode
  INTO v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id         = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at   IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owned by this student';
  END IF;

  -- ── 4. Practice-mode whitelist ───────────────────────────────────────────
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- ── 5. Config-shape guard ────────────────────────────────────────────────
  IF v_config IS NULL
     OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  -- ── 6. Membership check — MUST precede any answer-key column read ────────
  v_session_question_ids :=
    ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %',
      p_question_id, p_session_id;
  END IF;

  -- ── 7. Fetch question row (answer-key columns) ───────────────────────────
  -- §15 carve-out: no deleted_at filter — question reached via the immutable
  -- write-once quiz_sessions.config.question_ids (membership verified above).
  -- docs/security.md §15, docs/database.md §3.
  SELECT
    q.question_type,
    q.canonical_answer,
    q.accepted_synonyms,
    q.blanks_config,
    q.ordering_items,
    q.diagram_config,
    q.explanation_text,
    q.explanation_image_url
  INTO
    v_qtype,
    v_canonical,
    v_synonyms,
    v_blanks,
    v_ordering_items,
    v_diagram_config,
    v_explanation_text,
    v_explanation_image
  FROM questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  -- ── 8. Reject multiple_choice ─────────────────────────────────────────────
  IF v_qtype = 'multiple_choice' THEN
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;

  -- ── 9. Grade by question type ─────────────────────────────────────────────

  IF v_qtype = 'short_answer' THEN
    IF p_response_text IS NULL OR p_blank_answers IS NOT NULL OR p_order IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF v_canonical IS NULL THEN
      RAISE EXCEPTION 'question_missing_canonical_answer';
    END IF;

    v_norm       := normalize_answer(p_response_text);
    v_is_correct := (v_norm <> '' AND (
      v_norm = COALESCE(normalize_answer(v_canonical), '')
      OR EXISTS (
        SELECT 1 FROM unnest(v_synonyms) AS s
        WHERE normalize_answer(s) = v_norm
      )
    ));

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       v_canonical,
      'blanks',               NULL,
      'correct_order',        NULL,
      'correct_mapping',      NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'dialog_fill' THEN
    IF p_blank_answers IS NULL OR p_response_text IS NOT NULL OR p_order IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_blank_answers) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    v_blank_results := '[]'::jsonb;
    v_all_correct   := true;

    FOR v_blank_entry IN SELECT * FROM jsonb_array_elements(p_blank_answers)
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
      FROM jsonb_array_elements(v_blanks) AS b
      WHERE (b->>'index')::int = v_blank_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      IF v_blank_canonical IS NULL THEN
        RAISE EXCEPTION 'question_blank_missing_canonical';
      END IF;

      v_norm        := normalize_answer(coalesce(v_blank_entry->>'response_text', ''));
      v_blank_correct := (v_norm <> '' AND (
        v_norm = COALESCE(normalize_answer(v_blank_canonical), '')
        OR EXISTS (
          SELECT 1 FROM unnest(v_blank_synonyms) AS s
          WHERE normalize_answer(s) = v_norm
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
      FROM jsonb_array_elements(p_blank_answers) AS e
      WHERE (e->>'blank_index') ~ '^\d{1,4}$'
    ) = jsonb_array_length(v_blanks);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               v_blank_results,
      'correct_order',        NULL,
      'correct_mapping',      NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'ordering' THEN
    -- ordering: p_order (jsonb array of item ids in the student's sequence)
    -- required; p_response_text + p_blank_answers + p_mapping must be NULL.
    IF p_order IS NULL OR p_response_text IS NOT NULL OR p_blank_answers IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_order) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- Correct iff the submitted id sequence equals the canonical array order of
    -- ordering_items, element for element (full coverage — partial credit is a
    -- batch-submit / report concern, not immediate feedback's binary signal).
    v_n          := jsonb_array_length(v_ordering_items);
    v_is_correct := (jsonb_array_length(p_order) = v_n);
    IF v_is_correct THEN
      FOR v_i IN 0 .. v_n - 1 LOOP
        IF (p_order->>v_i) IS DISTINCT FROM (v_ordering_items->v_i->>'id') THEN
          v_is_correct := false;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Revealed canonical order = the item IDs in canonical array order. Ids are
    -- unambiguous; two items may share display text, so the client compares
    -- submitted ids against these per slot and maps each id back to its text.
    SELECT jsonb_agg(ord.elem->>'id' ORDER BY ord.idx)
    INTO v_correct_order
    FROM jsonb_array_elements(v_ordering_items) WITH ORDINALITY AS ord(elem, idx);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               NULL,
      'correct_order',        v_correct_order,
      'correct_mapping',      NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'diagram_label' THEN
    -- diagram_label: p_mapping (jsonb array of {zone_id,label_id} the student
    -- placed) required; p_response_text + p_blank_answers + p_order must be
    -- NULL. Correctness is a SET comparison (order in the array is
    -- meaningless, unlike ordering) — every zone must be covered exactly
    -- once and every submitted {zone_id,label_id} pair must match the
    -- canonical diagram_config.answer entry for that zone.
    IF p_mapping IS NULL OR p_response_text IS NOT NULL OR p_blank_answers IS NOT NULL
       OR p_order IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_mapping) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    v_n          := jsonb_array_length(v_diagram_config->'answer');
    v_is_correct := (
      jsonb_array_length(p_mapping) = v_n
      AND (
        SELECT count(DISTINCT pm->>'zone_id')
        FROM jsonb_array_elements(p_mapping) AS pm
      ) = v_n
      AND (
        SELECT count(*)
        FROM jsonb_array_elements(p_mapping) AS pm
        WHERE NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_diagram_config->'answer') AS ca
          WHERE ca->>'zone_id'  = pm->>'zone_id'
            AND ca->>'label_id' = pm->>'label_id'
        )
      ) = 0
    );

    -- Revealed canonical mapping = the raw {zone_id,label_id} answer array.
    -- The client already holds the full zones + labels arrays from the
    -- initial delivery (mig 152), so it resolves ids to display text/position
    -- locally — same posture as ordering's revealed id-only correct_order.
    v_correct_mapping := v_diagram_config->'answer';

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               NULL,
      'correct_order',        NULL,
      'correct_mapping',      v_correct_mapping,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSE
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;
END;
$$;

-- Re-grant explicitly so the migration is self-contained on a fresh db reset.
-- Do NOT include answer-key columns in any separate column-level grant.
GRANT EXECUTE ON FUNCTION check_non_mc_answer(uuid, uuid, text, jsonb, jsonb, jsonb) TO authenticated;
