-- Migration 151: AI ICAO ELP — student-facing (Class A) RPCs.
--
-- Four SECURITY DEFINER RPCs the student calls (via Server Actions). All carry
-- the full guard set (security.md rule 12), modelled on start_vfr_rt_exam_session
-- (mig 099): auth.uid() null-check + active-user gate + ownership scope on every
-- read/write + deleted_at IS NULL on every SELECT + SET search_path = public +
-- cached-role audit subqueries (rule 10). All GRANT EXECUTE TO authenticated.
--
-- These are owned by postgres (BYPASSRLS) like every definer in this repo, so
-- their writes pass FORCE RLS; ownership is enforced EXPLICITLY here (WHERE
-- student_id = auth.uid()), never delegated to RLS — mandatory because these
-- tables carry multiple permissive SELECT policies (security.md rule 11).
--
-- The grader RPC (write_oral_section_grade) is Class B — grader-only, NOT granted
-- to authenticated — and lives in 152_write_oral_section_grade.sql. Depends on
-- mig 150 (tables).

-- ============================================================
-- 1. start_oral_exam_session() → { session_id, status, sections, started_at }
--    Idempotent resume of an in-flight attempt (mirrors start_vfr_rt_exam_session).
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_oral_exam_session()
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
  v_sections     jsonb := jsonb_build_array(
    jsonb_build_object('section_no', 1, 'type', 'interview'),
    jsonb_build_object('section_no', 2, 'type', 'picture'),
    jsonb_build_object('section_no', 3, 'type', 'comms'),
    jsonb_build_object('section_no', 4, 'type', 'listening'),
    jsonb_build_object('section_no', 5, 'type', 'video')
  );
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

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
      'started_at', v_resume.started_at
    );
  END IF;

  BEGIN
    INSERT INTO public.oral_exam_sessions (organization_id, student_id, config)
    VALUES (v_org_id, v_student_id, jsonb_build_object('sections', v_sections))
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
      'sections', v_resume.config->'sections', 'started_at', v_resume.started_at
    );
  END;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_org_id, v_student_id, v_student_role, 'oral_exam.started',
          'oral_exam_session', v_session_id, '{}'::jsonb);

  RETURN jsonb_build_object(
    'session_id', v_session_id, 'status', 'in_progress',
    'sections', v_sections, 'started_at', v_started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_oral_exam_session() TO authenticated;

-- ============================================================
-- 2. submit_oral_section_response(p_session_id, p_section_no, p_audio_path, p_duration_ms)
--    → response_id. Records the audio path; the DB webhook fires on this INSERT.
--    Records NO metered usage — the grader (152) is the single source of truth for
--    stt_seconds/llm_tokens, read from the actual provider responses.
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
  SELECT s.status INTO v_status
  FROM public.oral_exam_sessions s
  WHERE s.id = p_session_id AND s.student_id = v_student_id AND s.deleted_at IS NULL
  FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'oral_session_not_found';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'oral_session_not_active';
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

  -- When all 5 sections are recorded, advance the session to 'grading'.
  SELECT count(*) INTO v_count
  FROM public.oral_exam_section_responses WHERE session_id = p_session_id;
  IF v_count >= 5 THEN
    UPDATE public.oral_exam_sessions
    SET status = 'grading'
    WHERE id = p_session_id AND student_id = v_student_id AND status = 'in_progress';
  END IF;

  RETURN v_response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_oral_section_response(uuid, smallint, text, int) TO authenticated;

-- ============================================================
-- 3. discard_oral_exam_session(p_session_id) → boolean. Owner-scoped soft-delete.
-- ============================================================
CREATE OR REPLACE FUNCTION public.discard_oral_exam_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id   uuid := auth.uid();
  v_org_id       uuid;
  v_student_role text;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT u.organization_id, u.role INTO v_org_id, v_student_role
  FROM public.users u WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Discard applies to an in-flight attempt only (in_progress/grading). A completed
  -- 'graded' report is preserved — it already has ended_at set and is not "active",
  -- so excluding it here prevents throwing away a finished report via "discard".
  UPDATE public.oral_exam_sessions
  SET status = 'discarded', deleted_at = now(), deleted_by = v_student_id, ended_at = now()
  WHERE id = p_session_id AND student_id = v_student_id AND deleted_at IS NULL
    AND status <> 'graded';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'oral_session_not_found';
  END IF;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_org_id, v_student_id, v_student_role, 'oral_exam.discarded',
          'oral_exam_session', p_session_id, '{}'::jsonb);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discard_oral_exam_session(uuid) TO authenticated;

-- ============================================================
-- 4. get_oral_exam_report(p_session_id) → jsonb. Owner + ended_at-gated (the
--    reveal analog of get_report_answer_keys): scores are readable only once the
--    exam is complete. Owner scope is explicit (rule 11).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_oral_exam_report(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_session    record;
  v_result     jsonb;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  PERFORM 1 FROM public.users WHERE id = v_student_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  SELECT s.id, s.status, s.total_final_level, s.started_at, s.ended_at
  INTO v_session
  FROM public.oral_exam_sessions s
  WHERE s.id = p_session_id AND s.student_id = v_student_id AND s.deleted_at IS NULL;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'oral_session_not_found';
  END IF;
  -- Reveal gate: scores readable only once grading is finalized. status='graded'
  -- implies ended_at is set; checking status (not just ended_at) hardens against any
  -- future path that sets ended_at without finalizing (defense-in-depth).
  IF v_session.status <> 'graded' OR v_session.ended_at IS NULL THEN
    RAISE EXCEPTION 'oral_exam_not_complete';
  END IF;

  SELECT jsonb_build_object(
    'session_id',        v_session.id,
    'status',            v_session.status,
    'total_final_level', v_session.total_final_level,
    'started_at',        v_session.started_at,
    'ended_at',          v_session.ended_at,
    'descriptors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'descriptor', d.descriptor, 'level', d.level, 'rationale', d.rationale)
               ORDER BY d.descriptor)
      FROM public.oral_exam_descriptor_scores d
      WHERE d.session_id = p_session_id AND d.section_no IS NULL
    ), '[]'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(sec ORDER BY sec->>'section_no')
      FROM (
        SELECT jsonb_build_object(
          'section_no',      r.section_no,
          'status',          r.status,
          'transcript_text', r.transcript_text,
          'scores', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'descriptor', ds.descriptor, 'level', ds.level, 'rationale', ds.rationale)
                     ORDER BY ds.descriptor)
            FROM public.oral_exam_descriptor_scores ds
            WHERE ds.session_id = p_session_id AND ds.section_no = r.section_no
          ), '[]'::jsonb)
        ) AS sec
        FROM public.oral_exam_section_responses r
        WHERE r.session_id = p_session_id
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_oral_exam_report(uuid) TO authenticated;
