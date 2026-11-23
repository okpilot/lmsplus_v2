-- void unused codes of a sitting (all or given entries); one audit row per voided code.
CREATE OR REPLACE FUNCTION private.void_unused_sitting_codes(
  p_sitting_id uuid, p_entry_ids uuid[], p_reason text, p_actor uuid, p_actor_role text, p_org uuid
)
RETURNS int
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n int;
BEGIN
  WITH v AS (
    UPDATE public.internal_exam_codes c
       SET voided_at = now(), voided_by = p_actor, void_reason = p_reason
      FROM public.exam_sitting_entries e
     WHERE c.sitting_entry_id = e.id AND e.sitting_id = p_sitting_id
       AND (p_entry_ids IS NULL OR e.id = ANY(p_entry_ids))
       AND c.consumed_at IS NULL AND c.voided_at IS NULL AND c.deleted_at IS NULL
       AND c.organization_id = p_org
    RETURNING c.id AS code_id, c.student_id, c.subject_id, e.id AS entry_id
  ), a AS (
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    SELECT p_org, p_actor, p_actor_role, 'internal_exam.code_voided', 'internal_exam_code', v.code_id,
           jsonb_build_object('reason', p_reason, 'was_consumed', false, 'sitting_id', p_sitting_id,
                              'entry_id', v.entry_id, 'student_id', v.student_id, 'subject_id', v.subject_id)
      FROM v
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM a;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.void_unused_sitting_codes(uuid, uuid[], text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
