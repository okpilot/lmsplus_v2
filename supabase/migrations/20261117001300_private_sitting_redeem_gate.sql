-- private.sitting_redeem_gate: exam-start gate for sitting codes. #1777
CREATE OR REPLACE FUNCTION private.sitting_redeem_gate(
  p_entry_id uuid, p_sitting_status text, p_scheduled_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_entry_id IS NULL THEN
    RETURN;
  END IF;

  IF p_sitting_status IS DISTINCT FROM 'open' OR private.sitting_day_ended(p_scheduled_at) THEN
    RAISE EXCEPTION 'sitting_not_open';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.sitting_redeem_gate(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- private.sitting_pass_gate: already_passed check, called after the active-session guard. #1777
CREATE OR REPLACE FUNCTION private.sitting_pass_gate(
  p_org_id uuid, p_student_id uuid, p_subject_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions q
     WHERE q.organization_id = p_org_id
       AND q.student_id = p_student_id
       AND q.subject_id = p_subject_id
       AND q.mode = 'internal_exam'
       AND q.deleted_at IS NULL
       AND q.ended_at IS NOT NULL
       AND q.passed IS TRUE
       AND NOT EXISTS (
         SELECT 1 FROM public.internal_exam_codes c2
          WHERE c2.consumed_session_id = q.id
            AND c2.voided_at IS NOT NULL
            AND c2.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'already_passed';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.sitting_pass_gate(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.void_unused_sitting_codes(uuid, uuid[], text, uuid, text, uuid) IS
  'Takes no sitting lock. Every caller holds exam_sittings FOR UPDATE.';
