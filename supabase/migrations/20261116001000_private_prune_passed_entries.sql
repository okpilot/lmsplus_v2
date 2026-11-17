-- auto-remove live entries (no consumed code) of a scheduled/open sitting whose student passed the subject.
-- Voids unused codes (reason passed_elsewhere), soft-deletes the entry, audits entry_auto_removed. Candidate row stays.
CREATE OR REPLACE FUNCTION private.prune_passed_entries(
  p_org uuid, p_sitting_id uuid, p_actor uuid, p_role text
)
RETURNS int
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_n int := 0;
BEGIN
  PERFORM 1 FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = p_org FOR UPDATE;
  SELECT COALESCE(array_agg(e.id), '{}') INTO v_ids
    FROM public.exam_sitting_entries e
    JOIN public.exam_sittings s ON s.id = e.sitting_id
   WHERE e.sitting_id = p_sitting_id AND e.organization_id = p_org AND e.deleted_at IS NULL
     AND s.status IN ('scheduled', 'open')
     AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c
                      WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.quiz_sessions q
                  WHERE q.student_id = e.user_id AND q.subject_id = e.subject_id
                    AND q.organization_id = p_org AND q.mode = 'internal_exam' AND q.deleted_at IS NULL
                    AND q.ended_at IS NOT NULL AND q.passed IS TRUE
                    AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c2
                                     WHERE c2.consumed_session_id = q.id AND c2.voided_at IS NOT NULL));
  IF cardinality(v_ids) = 0 THEN RETURN 0; END IF;

  PERFORM private.void_unused_sitting_codes(p_sitting_id, v_ids, 'passed_elsewhere', p_actor, p_role, p_org);

  WITH upd AS (
    UPDATE public.exam_sitting_entries e SET deleted_at = now(), deleted_by = p_actor
     WHERE e.id = ANY(v_ids) AND e.deleted_at IS NULL
    RETURNING e.id, e.user_id, e.subject_id
  ), a AS (
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    SELECT p_org, p_actor, p_role, 'exam_sitting.entry_auto_removed', 'exam_sitting', p_sitting_id,
           jsonb_build_object('entry_id', u.id, 'user_id', u.user_id, 'subject_id', u.subject_id,
                              'sitting_id', p_sitting_id, 'passing_session_id', ps.id, 'passed_at', ps.ended_at)
      FROM upd u
      CROSS JOIN LATERAL (
        SELECT q.id, q.ended_at FROM public.quiz_sessions q
         WHERE q.student_id = u.user_id AND q.subject_id = u.subject_id AND q.organization_id = p_org
           AND q.mode = 'internal_exam' AND q.deleted_at IS NULL AND q.ended_at IS NOT NULL AND q.passed IS TRUE
         ORDER BY q.ended_at DESC LIMIT 1) ps
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM a;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.prune_passed_entries(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
