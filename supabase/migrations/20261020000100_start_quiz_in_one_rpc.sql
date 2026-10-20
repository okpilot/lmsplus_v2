-- #1548: one RPC round trip per quiz start. Adds start_practice_quiz (draw + start_quiz_session)
-- and start_discovery (draw + discovery session + audit + answer-key payload + flagged ids).
-- Additive: get_random_question_ids, start_quiz_session, start_discovery_session and
-- get_study_questions stay until the app switches over; a later migration drops the old callers' RPCs.

---------------------------------------------------------------------------
-- Practice start. SECURITY INVOKER: the draw runs under RLS exactly like
-- get_random_question_ids; every start guard stays inside start_quiz_session.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_practice_quiz(
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_count        int,
  p_filters      text[],
  p_calc_mode    text DEFAULT 'all',
  p_has_image    text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids        uuid[];
  v_session_id uuid;
BEGIN
  -- Same draw and 500 cap as get_random_question_ids (COALESCE before LIMIT: LIMIT NULL is unbounded).
  SELECT array_agg(d.id ORDER BY d.rn) INTO v_ids
  FROM (
    SELECT p.id, row_number() OVER (ORDER BY random()) AS rn
    FROM public._filtered_question_pool(
      p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image
    ) p
    ORDER BY rn
    LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)
  ) d;

  IF v_ids IS NULL THEN
    -- start_quiz_session is skipped on an empty draw, so gate a deactivated caller here.
    IF NOT EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = (select auth.uid()) AND u.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'user not found or inactive';
    END IF;
    RETURN jsonb_build_object('session_id', NULL, 'question_ids', '[]'::jsonb);
  END IF;

  v_session_id := public.start_quiz_session(
    'quick_quiz',
    p_subject_id,
    CASE WHEN cardinality(p_topic_ids) = 1 THEN p_topic_ids[1] END,
    v_ids
  );

  RETURN jsonb_build_object('session_id', v_session_id, 'question_ids', to_jsonb(v_ids));
END;
$$;

---------------------------------------------------------------------------
-- Discovery start. SECURITY DEFINER (reads the REVOKE-gated answer key), so the
-- org scope is an explicit join: the pool gets its org scoping from RLS, which
-- DEFINER bypasses. Guards copied from start_discovery_session (20260629000200)
-- and get_study_questions (20260629000700).
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_discovery(
  p_subject_id   uuid,
  p_topic_ids    uuid[],
  p_subtopic_ids uuid[],
  p_count        int,
  p_filters      text[],
  p_calc_mode    text DEFAULT 'all',
  p_has_image    text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_org_id     uuid;
  v_role       text;
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

  -- Single-active-session invariant (mig 136): replace the caller's own abandoned
  -- discovery row, then block on any other active session.
  UPDATE public.quiz_sessions SET deleted_at = now()
   WHERE student_id = v_uid AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions qs
     WHERE qs.student_id = v_uid
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
       AND qs.mode <> 'discovery'
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  -- Defence in depth for the answer-key rule: the payload below carries correct_option_id,
  -- so refuse while any non-practice session is live (get_study_questions, mig 142).
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions s
    WHERE s.student_id = v_uid
      AND s.mode NOT IN ('smart_review', 'quick_quiz', 'discovery')
      AND s.ended_at IS NULL
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_exam_session';
  END IF;

  SELECT array_agg(d.id ORDER BY d.rn) INTO v_ids
  FROM (
    SELECT p.id, row_number() OVER (ORDER BY random()) AS rn
    FROM public._filtered_question_pool(
      p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image,
      'multiple_choice'
    ) p
    JOIN public.questions q ON q.id = p.id AND q.organization_id = v_org_id
    ORDER BY rn
    LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)
  ) d;

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('session_id', NULL, 'questions', '[]'::jsonb, 'flagged_ids', '[]'::jsonb);
  END IF;

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

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
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
    ) ORDER BY array_position(v_ids, q.id)
  ), '[]'::jsonb)
  INTO v_questions
  FROM public.questions q
  JOIN public.easa_subjects  s  ON s.id = q.subject_id
  JOIN public.easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN public.easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.id = ANY (v_ids)
    AND q.organization_id = v_org_id
    AND q.deleted_at IS NULL
    AND q.status = 'active'
    AND q.question_type = 'multiple_choice';

  SELECT COALESCE(jsonb_agg(f.question_id ORDER BY array_position(v_ids, f.question_id)), '[]'::jsonb)
  INTO v_flagged
  FROM public.flagged_questions f
  WHERE f.student_id = v_uid
    AND f.deleted_at IS NULL
    AND f.question_id = ANY (v_ids);

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'questions', v_questions,
    'flagged_ids', v_flagged
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_practice_quiz(uuid, uuid[], uuid[], int, text[], text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_discovery(uuid, uuid[], uuid[], int, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_practice_quiz(uuid, uuid[], uuid[], int, text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_discovery(uuid, uuid[], uuid[], int, text[], text, text) TO authenticated;

COMMENT ON FUNCTION public.start_practice_quiz(uuid, uuid[], uuid[], int, text[], text, text) IS
  'Draws up to LEAST(COALESCE(p_count, 0), 500) random ids from the filtered pool (as get_random_question_ids) and starts a quick_quiz session over them via start_quiz_session. Returns {session_id, question_ids}; an empty draw returns session_id null and creates no row. All start guards live in start_quiz_session. SECURITY INVOKER.';

COMMENT ON FUNCTION public.start_discovery(uuid, uuid[], uuid[], int, text[], text, text) IS
  'Study/Discovery start in one call: draws an MC-only, own-org set, creates the discovery session + audit row, returns {session_id, questions, flagged_ids}. DELIBERATE answer-key exposure: questions carry correct_option_id, like get_study_questions; exam integrity is enforced by the active-exam-session guard (any live non-practice session raises). Empty draw returns session_id null, no row. No replay branch: a concurrent second start raises another_session_active. SECURITY DEFINER, org-scoped by explicit join.';
