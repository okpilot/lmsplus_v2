-- start_discovery: raise not_enrolled before any subject-scoped read (red-team KQ). #1637 (Decision 162)
-- Body copied from the latest definition; only the enrolment pre-gate is added.
CREATE OR REPLACE FUNCTION public.start_discovery(p_subject_id uuid, p_topic_ids uuid[], p_subtopic_ids uuid[], p_count integer, p_filters text[], p_calc_mode text DEFAULT 'all'::text, p_has_image text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_org_id     uuid;
  v_role       text;
  v_filters    text[] := array_remove(p_filters, 'all');
  v_ids        uuid[];
  v_session_id uuid;
  v_questions  jsonb;
  v_flagged    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT u.organization_id, u.role
  INTO v_org_id, v_role
  FROM public.users u
  WHERE u.id = v_uid
    AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Enrolment pre-gate: raise before any subject-scoped read or side effect, so a non-enrolled
  -- caller learns nothing about the hidden subject. trg_quiz_sessions_enforce_enrolment stays the
  -- INSERT backstop. NULL p_subject_id falls through unless the
  -- caller has no accessible subject (NULL NOT IN <empty set> is TRUE).
  IF p_subject_id NOT IN (SELECT private.accessible_subject_ids()) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  -- One statement draws the ids and builds the answer-key payload from the same rows, so the
  -- session's ids and the payload cannot diverge (READ COMMITTED re-reads per statement).
  -- rn is assigned after the top-N LIMIT, so the pool is never fully sorted; only ids are
  -- sorted, the payload columns are read by the re-join below.
  WITH draw AS (
    SELECT s.id, row_number() OVER (ORDER BY s.r) AS rn
    FROM (
      SELECT q.id, random() AS r
      FROM public._filtered_question_pool(
        p_subject_id, p_topic_ids, p_subtopic_ids, v_filters, p_calc_mode, p_has_image,
        'multiple_choice'
      ) p
      JOIN public.questions q ON q.id = p.id
       AND q.organization_id = v_org_id
       AND q.deleted_at IS NULL
       AND q.status = 'active'
       AND q.question_type = 'multiple_choice'
      ORDER BY r
      LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)
    ) s
  )
  SELECT
    array_agg(d.id ORDER BY d.rn),
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'question_text', q.question_text,
        'question_image_url', q.question_image_url,
        'options', (SELECT jsonb_agg(
           jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
           ORDER BY ord
         )
         FROM jsonb_array_elements(q.options) WITH ORDINALITY AS o(opt, ord)),
        'correct_option_id', q.correct_option_id,
        'subject_code', s.code,
        'topic_name', t.name,
        'subtopic_name', st.name,
        'explanation_text', q.explanation_text,
        'explanation_image_url', q.explanation_image_url,
        'question_number', q.question_number,
        'difficulty', q.difficulty
      ) ORDER BY d.rn
    )
  INTO v_ids, v_questions
  FROM draw d
  JOIN public.questions q ON q.id = d.id AND q.deleted_at IS NULL
  JOIN public.easa_subjects  s  ON s.id = q.subject_id
  JOIN public.easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN public.easa_subtopics st ON st.id = q.subtopic_id;

  -- Empty draw: no checks and no side effect (the caller's live sessions stay untouched).
  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('session_id', NULL, 'questions', '[]'::jsonb, 'flagged_ids', '[]'::jsonb);
  END IF;

  -- Single-active-session invariant (mig 136). The payload above carries correct_option_id, so
  -- any live non-discovery session (exam included) must stop the call before it is returned.
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions qs
     WHERE qs.student_id = v_uid
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
       AND qs.mode <> 'discovery'
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  -- Replace the caller's own abandoned discovery row.
  UPDATE public.quiz_sessions SET deleted_at = now()
   WHERE student_id = v_uid AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;

  -- No replay branch: a concurrent second start loses the unique index race and raises.
  BEGIN
    INSERT INTO public.quiz_sessions
      (organization_id, student_id, mode, subject_id, config, total_questions)
    VALUES (
      v_org_id,
      v_uid,
      'discovery',
      p_subject_id,
      jsonb_build_object('question_ids', to_jsonb(v_ids)),
      cardinality(v_ids)
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'another_session_active';
  END;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (v_org_id, v_uid, v_role, 'discovery.started', 'quiz_session', v_session_id);

  SELECT COALESCE(jsonb_agg(f.question_id ORDER BY array_position(v_ids, f.question_id)), '[]'::jsonb)
  INTO v_flagged
  FROM public.active_flagged_questions f
  WHERE f.student_id = v_uid
    AND f.question_id = ANY (v_ids);

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'questions', v_questions,
    'flagged_ids', v_flagged
  );
END;
$function$;
