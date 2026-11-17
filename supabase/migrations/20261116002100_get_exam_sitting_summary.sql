-- sitting summary. Lazy-closes expired sittings and prunes passed entries first (VOLATILE).
CREATE OR REPLACE FUNCTION public.get_exam_sitting_summary(p_sitting_id uuid)
RETURNS TABLE(status text, scheduled_at timestamptz, candidates int, deactivated_candidates int, entries int,
              entries_without_code int, codes_issued int, entries_with_attempt int,
              pending_removal_notices int, day_ended boolean,
              attempts_running int, entries_not_started int, students_not_started int, entries_issuable int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_cand int;
  v_deact int;
  v_entries int;
  v_issued int;
  v_attempt int;
  v_pending int;
  v_running int;
  v_ns_entries int;
  v_ns_students int;
  v_issuable int;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  PERFORM private.close_expired_sittings(v_g.org_id);
  SELECT * INTO v_s FROM public.exam_sittings s WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status IN ('scheduled', 'open') THEN
    PERFORM private.prune_passed_entries(v_g.org_id, p_sitting_id, v_g.admin_id, v_g.admin_role);
  END IF;

  -- security.md §15 exception (f)
  SELECT count(*), count(*) FILTER (WHERE u.deleted_at IS NOT NULL) INTO v_cand, v_deact
    FROM public.exam_sitting_candidates c JOIN public.users u ON u.id = c.user_id
   WHERE c.sitting_id = p_sitting_id AND c.deleted_at IS NULL;
  SELECT count(*) INTO v_entries FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL;
  SELECT count(*) INTO v_issued FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.internal_exam_codes c WHERE c.sitting_entry_id = e.id AND c.deleted_at IS NULL
                  AND (c.voided_at IS NULL OR c.consumed_at IS NOT NULL));
  SELECT count(*) INTO v_attempt FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.internal_exam_codes c WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL);
  SELECT count(*) INTO v_running FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.internal_exam_codes c JOIN public.quiz_sessions q ON q.id = c.consumed_session_id
                  WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL AND q.ended_at IS NULL
                    AND q.deleted_at IS NULL);
  SELECT count(*), count(DISTINCT e.user_id) INTO v_ns_entries, v_ns_students FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL);
  SELECT count(*) INTO v_issuable FROM private.sitting_issue_plan(v_g.org_id, p_sitting_id, NULL, NULL) p WHERE p.action <> 'skip';
  SELECT count(*) INTO v_pending FROM public.audit_events a
   WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
     AND a.event_type = 'exam_sitting.entry_auto_removed'
     AND NOT EXISTS (SELECT 1 FROM public.audit_events n
                      WHERE n.organization_id = v_g.org_id AND n.resource_id = p_sitting_id
                        AND n.event_type = 'exam_sitting.notice_emailed'
                        AND n.metadata ->> 'kind' = 'entry_auto_removed'
                        AND n.metadata ->> 'entry_id' = a.metadata ->> 'entry_id');

  RETURN QUERY SELECT v_s.status, v_s.scheduled_at, v_cand, v_deact, v_entries, v_entries - v_issued, v_issued,
                      v_attempt, v_pending, private.sitting_day_ended(v_s.scheduled_at),
                      v_running, v_ns_entries, v_ns_students, v_issuable;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_exam_sitting_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_sitting_summary(uuid) TO authenticated;
