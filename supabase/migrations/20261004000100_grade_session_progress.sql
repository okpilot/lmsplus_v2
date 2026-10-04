-- _grade_session_progress: grades a session's saved answers (quiz_session_progress) through the
-- per-type graders, writing quiz_session_answers + student_responses. A question that cannot be
-- graded is skipped with a WARNING and counts unanswered. Internal helper; callers lock the session.

CREATE OR REPLACE FUNCTION _grade_session_progress(
  p_session_id uuid,
  p_student_id uuid,
  p_org_id     uuid,
  p_mode       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config      jsonb;
  v_ids         uuid[];
  r             record;
  v_rt          int;
  v_selected    text;
  v_text        text;
  v_el          jsonb;
  v_n           int;
  v_slot        int;
  v_blank_text  text;
  v_correct     boolean;
BEGIN
  SELECT qs.config INTO v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = p_student_id;
  IF NOT FOUND OR v_config IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;
  v_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  -- §15 carve-out: no deleted_at filter — immutable write-once config.question_ids (mig 079); docs/security.md §15, docs/database.md §3.
  FOR r IN
    SELECT p.question_id, p.answer, p.time_spent_ms,
           q.question_type, q.correct_option_id, q.options, q.canonical_answer,
           q.accepted_synonyms, q.blanks_config, q.ordering_items, q.diagram_config
    FROM quiz_session_progress p
    JOIN questions q ON q.id = p.question_id
    WHERE p.session_id = p_session_id
      AND p.student_id = p_student_id
      AND p.answer IS NOT NULL
      AND p.question_id = ANY(v_ids)
    ORDER BY p.question_id
  LOOP
    BEGIN
      v_rt := COALESCE(r.time_spent_ms, 0);
      IF jsonb_typeof(r.answer) <> 'object' THEN
        RAISE EXCEPTION 'saved answer is not an object';
      END IF;

      IF r.question_type = 'multiple_choice' THEN
        v_selected := r.answer->>'selected_option_id';
        IF p_mode = 'vfr_rt_exam' THEN
          IF v_selected IS NULL OR v_selected = '' THEN
            RAISE EXCEPTION 'empty selected option';
          END IF;
          IF r.correct_option_id IS NULL THEN
            RAISE EXCEPTION 'question has no correct option';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(r.options) opt WHERE opt->>'id' = v_selected
          ) THEN
            RAISE EXCEPTION 'option % does not belong to question', v_selected;
          END IF;
          v_correct := (v_selected = r.correct_option_id);
          INSERT INTO quiz_session_answers
            (session_id, question_id, selected_option_id, response_text, blank_index, is_correct, response_time_ms)
          VALUES
            (p_session_id, r.question_id, v_selected, NULL, NULL, v_correct, v_rt)
          ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;
          INSERT INTO student_responses
            (organization_id, student_id, question_id, session_id,
             selected_option_id, response_text, blank_index, is_correct, response_time_ms)
          VALUES
            (p_org_id, p_student_id, r.question_id, p_session_id,
             v_selected, NULL, NULL, v_correct, v_rt)
          ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;
        ELSE
          PERFORM _grade_record_mc(
            p_session_id, p_student_id, p_org_id, r.question_id,
            v_selected, r.correct_option_id, r.options, v_rt);
        END IF;

      ELSIF r.question_type = 'short_answer' THEN
        v_text := r.answer->>'response_text';
        IF v_text IS NULL THEN
          RAISE EXCEPTION 'missing response_text';
        END IF;
        PERFORM _grade_record_short_answer(
          p_session_id, p_student_id, p_org_id, r.question_id,
          v_text, r.canonical_answer, r.accepted_synonyms, v_rt);

      ELSIF r.question_type = 'dialog_fill' THEN
        IF jsonb_typeof(r.answer->'blanks') <> 'array' THEN
          RAISE EXCEPTION 'blanks is not an array';
        END IF;
        FOR v_el IN SELECT * FROM jsonb_array_elements(r.answer->'blanks')
        LOOP
          IF jsonb_typeof(v_el) <> 'object' THEN
            RAISE EXCEPTION 'blank entry is not an object';
          END IF;
          v_blank_text := v_el->>'blank_index';
          v_text       := v_el->>'response_text';
          IF v_blank_text IS NULL OR v_blank_text !~ '^\d{1,4}$' OR v_text IS NULL THEN
            RAISE EXCEPTION 'bad blank entry';
          END IF;
          PERFORM _grade_record_dialog_fill(
            p_session_id, p_student_id, p_org_id, r.question_id,
            v_blank_text::int, v_text, r.blanks_config, v_rt);
        END LOOP;

      ELSIF r.question_type = 'ordering' THEN
        IF jsonb_typeof(r.answer->'order') <> 'array' THEN
          RAISE EXCEPTION 'order is not an array';
        END IF;
        v_n := jsonb_array_length(r.ordering_items);
        IF jsonb_array_length(r.answer->'order') <> v_n
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.answer->'order') e
                      WHERE jsonb_typeof(e) <> 'string')
           OR (SELECT count(DISTINCT e #>> '{}') FROM jsonb_array_elements(r.answer->'order') e) <> v_n
        THEN
          RAISE EXCEPTION 'order is not a complete permutation of its items';
        END IF;
        FOR v_slot IN 0 .. v_n - 1
        LOOP
          PERFORM _grade_record_ordering(
            p_session_id, p_student_id, p_org_id, r.question_id,
            v_slot, r.answer->'order'->>v_slot, r.ordering_items, v_rt);
        END LOOP;

      ELSIF r.question_type = 'diagram_label' THEN
        IF jsonb_typeof(r.answer->'mapping') <> 'array' THEN
          RAISE EXCEPTION 'mapping is not an array';
        END IF;
        IF EXISTS (
          SELECT 1 FROM jsonb_array_elements(r.answer->'mapping') m
          WHERE jsonb_typeof(m) <> 'object'
             OR jsonb_typeof(m->'zone_id') <> 'string'
             OR jsonb_typeof(m->'label_id') <> 'string'
        ) THEN
          RAISE EXCEPTION 'bad mapping entry';
        END IF;
        IF (SELECT count(DISTINCT m->>'zone_id') <> count(*) OR count(DISTINCT m->>'label_id') <> count(*)
            FROM jsonb_array_elements(r.answer->'mapping') m) THEN
          RAISE EXCEPTION 'mapping repeats a zone or a label';
        END IF;
        FOR v_el IN SELECT * FROM jsonb_array_elements(r.answer->'mapping')
        LOOP
          PERFORM _grade_record_diagram_label(
            p_session_id, p_student_id, p_org_id, r.question_id,
            v_el->>'zone_id', v_el->>'label_id', r.diagram_config, v_rt);
        END LOOP;

      ELSE
        RAISE EXCEPTION 'unsupported question type %', r.question_type;
      END IF;
    EXCEPTION WHEN raise_exception THEN
      RAISE WARNING '[grade_session_progress] question % skipped: %', r.question_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION _grade_session_progress(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
