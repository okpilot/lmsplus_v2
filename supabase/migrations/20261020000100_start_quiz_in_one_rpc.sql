-- #1548: one RPC round trip per quiz start. Adds start_practice_quiz (draw + start_quiz_session)
-- and start_discovery (draw + discovery session + audit + answer-key payload + flagged ids).
-- Additive: get_random_question_ids, start_quiz_session, start_discovery_session and
-- get_study_questions stay until the app switches over; a later migration drops the old callers' RPCs.

---------------------------------------------------------------------------
-- Practice start. SECURITY INVOKER: the draw runs under RLS exactly like
-- get_random_question_ids; start_quiz_session holds every start guard (the empty draw
-- never reaches it, so that path gates the active user itself).
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
  v_filters    text[] := array_remove(p_filters, 'all');
  v_topic_id   uuid;
  v_session_id uuid;
BEGIN
  -- 'all' is the UI's "no filter" sentinel; the pool would read it as a filter matching nothing.
  -- get_random_question_ids is SECURITY INVOKER with the same pool, clamp and RLS as this function.
  SELECT array_agg(g.id) INTO v_ids
  FROM public.get_random_question_ids(
    p_subject_id, p_topic_ids, p_subtopic_ids, p_count, v_filters, p_calc_mode, p_has_image
  ) g;

  IF v_ids IS NULL THEN
    -- start_quiz_session is skipped on an empty draw, so gate a deactivated caller here.
    IF NOT EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = (select auth.uid()) AND u.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'user not found or inactive';
    END IF;
    RETURN jsonb_build_object('session_id', NULL, 'question_ids', '[]'::jsonb);
  END IF;

  -- The pool ORs topic and subtopic scopes, so a drawn id can sit outside the single topic;
  -- start_quiz_session raises invalid_question_ids for that. Store the topic only when every
  -- drawn id belongs to it.
  IF cardinality(p_topic_ids) = 1 AND NOT EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = ANY (v_ids) AND q.topic_id IS DISTINCT FROM p_topic_ids[1]
  ) THEN
    v_topic_id := p_topic_ids[1];
  END IF;

  v_session_id := public.start_quiz_session('quick_quiz', p_subject_id, v_topic_id, v_ids);

  RETURN jsonb_build_object('session_id', v_session_id, 'question_ids', to_jsonb(v_ids));
END;
$$;

---------------------------------------------------------------------------
-- Discovery start. SECURITY DEFINER (reads the REVOKE-gated answer key), so the
-- org scope is an explicit join: the pool gets its org scoping from RLS, which
-- DEFINER bypasses. Guard tokens match start_discovery_session (20260629000200);
-- the payload columns match get_study_questions (20260629000700).
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

  -- One statement draws the ids and builds the answer-key payload from the same rows, so the
  -- session's ids and the payload cannot diverge (READ COMMITTED re-reads per statement).
  WITH draw AS (
    SELECT p.id, row_number() OVER (ORDER BY random()) AS rn
    FROM public._filtered_question_pool(
      p_subject_id, p_topic_ids, p_subtopic_ids, v_filters, p_calc_mode, p_has_image,
      'multiple_choice'
    ) p
    JOIN public.questions dq ON dq.id = p.id AND dq.organization_id = v_org_id
    ORDER BY rn
    LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)
  )
  SELECT
    array_agg(q.id ORDER BY d.rn),
    jsonb_agg(
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
      ) ORDER BY d.rn
    )
  INTO v_ids, v_questions
  FROM draw d
  JOIN public.questions q ON q.id = d.id
  JOIN public.easa_subjects  s  ON s.id = q.subject_id
  JOIN public.easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN public.easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.organization_id = v_org_id
    AND q.deleted_at IS NULL
    AND q.status = 'active'
    AND q.question_type = 'multiple_choice';

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
  'Draws up to LEAST(GREATEST(COALESCE(p_count, 0), 0), 500) random ids from the filtered pool (via get_random_question_ids; the "all" filter sentinel is ignored) and starts a quick_quiz session over them via start_quiz_session. Returns {session_id, question_ids}; an empty draw returns session_id null and creates no row. The session stores the topic id only when exactly one topic is given and every drawn id belongs to it. All start guards live in start_quiz_session. SECURITY INVOKER.';

COMMENT ON FUNCTION public.start_discovery(uuid, uuid[], uuid[], int, text[], text, text) IS
  'Study/Discovery start in one call: draws an MC-only, own-org set, creates the discovery session + audit row, returns {session_id, questions, flagged_ids}. DELIBERATE answer-key exposure: questions carry correct_option_id, like get_study_questions; exam integrity is enforced by the single-active-session check (a live session of any other mode, exam included, raises another_session_active before the payload is returned). Ids and payload come from one statement. Empty draw returns session_id null with no side effect (live sessions untouched, no checks beyond the active-user gate). The "all" filter sentinel is ignored. No replay branch: a concurrent second start raises another_session_active. SECURITY DEFINER, org-scoped by explicit join.';
