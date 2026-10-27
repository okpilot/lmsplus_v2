-- #1637: for a student target, every call discards open sessions and clears saved quizzes outside the final enrolment set. p_course_ids NULL keeps the current set (sweep only). Ids go to audit metadata as sessions_ended / saved_cleared.

CREATE OR REPLACE FUNCTION public.set_user_enrolments(
  p_user_id uuid,
  p_course_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_org  uuid;
  v_caller_role text;
  v_user_id     uuid;
  v_wanted      uuid[];
  v_added       uuid[];
  v_removed     uuid[];
  v_target_role text;
  v_subjects    uuid[];
  v_match       uuid[];
  v_ended       uuid[] := '{}';
  v_saved       uuid[] := '{}';
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT u.organization_id, u.role INTO v_caller_org, v_caller_role
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Row lock serializes concurrent calls for one user.
  SELECT u.id, u.role INTO v_user_id, v_target_role
  FROM public.users u
  WHERE u.id = p_user_id
    AND u.organization_id = v_caller_org
    AND u.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF p_course_ids IS NULL THEN
    SELECT COALESCE(array_agg(e.course_id), '{}') INTO v_wanted
    FROM public.course_enrolments e
    WHERE e.user_id = p_user_id AND e.deleted_at IS NULL;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_wanted FROM unnest(p_course_ids) AS x;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_wanted) AS w(id)
    WHERE w.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = w.id)
  ) THEN
    RAISE EXCEPTION 'course_not_found';
  END IF;

  WITH removed AS (
    UPDATE public.course_enrolments e
    SET deleted_at = now(), deleted_by = v_caller_id
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND NOT (e.course_id = ANY (v_wanted))
    RETURNING e.course_id
  )
  SELECT COALESCE(array_agg(course_id), '{}') INTO v_removed FROM removed;

  -- Staff see every subject, so the sweep applies to students only.
  IF v_target_role NOT IN ('admin', 'instructor') THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_subjects
    FROM public.easa_subjects s
    WHERE s.course_id <> ALL (v_wanted);

    -- Carve-out (security.md rule 9, §15): subject_id and config.question_ids are tested without
    -- deleted_at filters on easa_subjects/questions. Both are write-once on quiz_sessions
    -- (trg_quiz_sessions_immutable_columns); docs/database.md §3 "Scoring Soft-Deleted Questions".
    SELECT COALESCE(array_agg(qs.id), '{}') INTO v_match
    FROM public.quiz_sessions qs
    WHERE qs.student_id = p_user_id
      AND qs.organization_id = v_caller_org
      AND ((qs.ended_at IS NULL AND qs.deleted_at IS NULL) OR qs.saved_at IS NOT NULL)
      AND (
        qs.subject_id = ANY (v_subjects)
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(qs.config->'question_ids') = 'array'
                 THEN qs.config->'question_ids' ELSE '[]'::jsonb END
          ) AS qid(id)
          JOIN public.questions q ON q.id = qid.id::uuid
          WHERE q.organization_id = v_caller_org AND q.subject_id = ANY (v_subjects)
        )
      );

    WITH ended AS (
      UPDATE public.quiz_sessions qs
      SET deleted_at = now(), active_device_id = NULL
      WHERE qs.id = ANY (v_match)
        AND qs.ended_at IS NULL
        AND qs.deleted_at IS NULL
      RETURNING qs.id
    )
    SELECT COALESCE(array_agg(id), '{}') INTO v_ended FROM ended;

    WITH cleared AS (
      UPDATE public.quiz_sessions qs
      SET saved_at = NULL
      WHERE qs.id = ANY (v_match)
        AND qs.deleted_at IS NOT NULL
        AND qs.saved_at IS NOT NULL
        AND qs.id <> ALL (v_ended)
      RETURNING qs.id
    )
    SELECT COALESCE(array_agg(id), '{}') INTO v_saved FROM cleared;
  END IF;

  WITH added AS (
    INSERT INTO public.course_enrolments (organization_id, user_id, course_id, enrolled_by)
    SELECT v_caller_org, p_user_id, w.id, v_caller_id
    FROM unnest(v_wanted) AS w(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.course_enrolments e
      WHERE e.user_id = p_user_id AND e.course_id = w.id AND e.deleted_at IS NULL
    )
    RETURNING course_id
  )
  SELECT COALESCE(array_agg(course_id), '{}') INTO v_added FROM added;

  IF cardinality(v_added) > 0 OR cardinality(v_removed) > 0
     OR cardinality(v_ended) > 0 OR cardinality(v_saved) > 0 THEN
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_caller_org, v_caller_id, v_caller_role, 'user.enrolments_changed', 'user', p_user_id,
      jsonb_build_object(
        'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed),
        'sessions_ended', to_jsonb(v_ended), 'saved_cleared', to_jsonb(v_saved)
      )
    );
  END IF;
END;
$$;
