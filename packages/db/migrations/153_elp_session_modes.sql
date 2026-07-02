-- Migration 153: AI ICAO ELP — session modes ('practice' single-section vs
-- 'mock' 5-section). Generalizes start_oral_exam_session() and
-- submit_oral_section_response() to read the planned section count from the
-- session's own frozen config instead of a hardcoded 5. All existing guards
-- (auth.uid() null-check, active-user gate, ownership scope, soft-delete
-- filters, audit-subquery soft-delete, SET search_path = public) are
-- preserved verbatim. Depends on migs 150-152.

-- ============================================================
-- 1. start_oral_exam_session(p_mode) → { session_id, status, sections,
--    started_at, mode }. Signature changed (0-arg → 1-arg with default), so
--    the old 0-arg overload is dropped before redefining.
-- ============================================================
DROP FUNCTION IF EXISTS public.start_oral_exam_session();

CREATE FUNCTION public.start_oral_exam_session(p_mode text DEFAULT 'mock')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id   uuid := auth.uid();
  v_org_id       uuid;
  v_student_role text;
  v_resume       record;
  v_session_id   uuid;
  v_started_at   timestamptz;
  v_sections     jsonb;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_mode NOT IN ('practice', 'mock') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  v_sections := CASE
    WHEN p_mode = 'practice' THEN jsonb_build_array(
      jsonb_build_object('section_no', 1, 'type', 'interview')
    )
    ELSE jsonb_build_array(
      jsonb_build_object('section_no', 1, 'type', 'interview'),
      jsonb_build_object('section_no', 2, 'type', 'picture'),
      jsonb_build_object('section_no', 3, 'type', 'comms'),
      jsonb_build_object('section_no', 4, 'type', 'listening'),
      jsonb_build_object('section_no', 5, 'type', 'video')
    )
  END;

  -- Active-user gate + org/role cache in one deleted_at-filtered read (rules 9,10,12).
  SELECT u.organization_id, u.role INTO v_org_id, v_student_role
  FROM public.users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Idempotent resume: an in-flight oral exam is returned as-is (its config is
  -- frozen at start), rather than raising on the single-active unique index.
  SELECT s.id, s.config, s.started_at, s.status INTO v_resume
  FROM public.oral_exam_sessions s
  WHERE s.student_id = v_student_id
    AND s.ended_at IS NULL
    AND s.deleted_at IS NULL
  LIMIT 1;
  IF v_resume.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'session_id', v_resume.id,
      'status',     v_resume.status,
      'sections',   v_resume.config->'sections',
      'started_at', v_resume.started_at,
      'mode',       COALESCE(v_resume.config->>'mode', 'mock')
    );
  END IF;

  BEGIN
    INSERT INTO public.oral_exam_sessions (organization_id, student_id, config)
    VALUES (v_org_id, v_student_id, jsonb_build_object('mode', p_mode, 'sections', v_sections))
    RETURNING id, started_at INTO v_session_id, v_started_at;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a concurrent first-start race; return the winner's session.
    SELECT s.id, s.config, s.started_at, s.status INTO v_resume
    FROM public.oral_exam_sessions s
    WHERE s.student_id = v_student_id AND s.ended_at IS NULL AND s.deleted_at IS NULL
    LIMIT 1;
    IF v_resume.id IS NULL THEN
      RAISE EXCEPTION 'another_oral_exam_active';
    END IF;
    RETURN jsonb_build_object(
      'session_id', v_resume.id, 'status', v_resume.status,
      'sections', v_resume.config->'sections', 'started_at', v_resume.started_at,
      'mode', COALESCE(v_resume.config->>'mode', 'mock')
    );
  END;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_org_id, v_student_id, v_student_role, 'oral_exam.started',
          'oral_exam_session', v_session_id, '{}'::jsonb);

  RETURN jsonb_build_object(
    'session_id', v_session_id, 'status', 'in_progress',
    'sections', v_sections, 'started_at', v_started_at, 'mode', p_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_oral_exam_session(text) TO authenticated;

-- ============================================================
-- 2. submit_oral_section_response(...) — the finalize threshold is now the
--    session's OWN planned section count (v_planned, read from config),
--    instead of a hardcoded 5. p_section_no is also bounded by v_planned so a
--    practice (1-section) session cannot accept section_no=2.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_oral_section_response(
  p_session_id  uuid,
  p_section_no  smallint,
  p_audio_path  text,
  p_duration_ms int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id  uuid := auth.uid();
  v_status      text;
  v_config      jsonb;
  v_planned     int;
  v_response_id uuid;
  v_count       int;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  PERFORM 1 FROM public.users WHERE id = v_student_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;
  IF p_section_no IS NULL OR p_section_no < 1 OR p_section_no > 5 THEN
    RAISE EXCEPTION 'invalid_section_no';
  END IF;
  IF p_audio_path IS NULL OR length(trim(p_audio_path)) = 0 THEN
    RAISE EXCEPTION 'missing_audio_path';
  END IF;

  -- Ownership + active scope (explicit, not via RLS — rule 11). FOR UPDATE locks the
  -- session row so two concurrent final-section submits serialize: without it each
  -- could see only 4 committed responses (READ COMMITTED hides the other's uncommitted
  -- insert) and neither would flip the session to 'grading', stranding it in_progress.
  SELECT s.status, s.config INTO v_status, v_config
  FROM public.oral_exam_sessions s
  WHERE s.id = p_session_id AND s.student_id = v_student_id AND s.deleted_at IS NULL
  FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'oral_session_not_found';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'oral_session_not_active';
  END IF;

  v_planned := CASE
    WHEN jsonb_typeof(v_config->'sections') = 'array' THEN jsonb_array_length(v_config->'sections')
    ELSE NULL
  END;
  IF v_planned IS NULL OR v_planned < 1 THEN
    RAISE EXCEPTION 'invalid_session_config';
  END IF;
  IF p_section_no > v_planned THEN
    RAISE EXCEPTION 'invalid_section_no';
  END IF;

  -- The stored path is later dereferenced by the service-role grader, which
  -- BYPASSES storage RLS — so it must belong to the caller's own
  -- {org}/{student}/{session}/ prefix. A direct RPC caller (bypassing the Server
  -- Action that builds the path) could otherwise point it at another student's
  -- recording and have its transcript written into their own report. Path shape:
  -- {org}/{student}/{session}/{section}.<ext>, so segment [2]=student, [3]=session.
  IF (string_to_array(p_audio_path, '/'))[2] IS DISTINCT FROM v_student_id::text
     OR (string_to_array(p_audio_path, '/'))[3] IS DISTINCT FROM p_session_id::text THEN
    RAISE EXCEPTION 'invalid_audio_path';
  END IF;

  BEGIN
    INSERT INTO public.oral_exam_section_responses
      (session_id, section_no, audio_path, duration_ms, status)
    VALUES (p_session_id, p_section_no, p_audio_path, p_duration_ms, 'grading')
    RETURNING id INTO v_response_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'section_already_submitted';
  END;

  -- When all planned sections are recorded, advance the session to 'grading'.
  SELECT count(*) INTO v_count
  FROM public.oral_exam_section_responses WHERE session_id = p_session_id;
  IF v_count >= v_planned THEN
    UPDATE public.oral_exam_sessions
    SET status = 'grading'
    WHERE id = p_session_id AND student_id = v_student_id AND status = 'in_progress';
  END IF;

  RETURN v_response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_oral_section_response(uuid, smallint, text, int) TO authenticated;
