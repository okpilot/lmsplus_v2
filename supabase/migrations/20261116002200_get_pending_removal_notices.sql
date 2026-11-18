-- get_pending_removal_notices: auto-removed entries whose notice has not been recorded. Any sitting status.
CREATE OR REPLACE FUNCTION public.get_pending_removal_notices(p_sitting_id uuid)
RETURNS TABLE(entry_id uuid, user_id uuid, subject_id uuid, passed_at timestamptz, removed_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  -- security.md §15 exception (g): cancelled sittings are soft-deleted and stay readable
  PERFORM 1 FROM public.exam_sittings s WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  RETURN QUERY
  SELECT (a.metadata ->> 'entry_id')::uuid, (a.metadata ->> 'user_id')::uuid,
         (a.metadata ->> 'subject_id')::uuid, (a.metadata ->> 'passed_at')::timestamptz, a.created_at
    FROM public.audit_events a
   WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
     AND a.event_type = 'exam_sitting.entry_auto_removed'
     AND NOT EXISTS (SELECT 1 FROM public.audit_events n
                      WHERE n.organization_id = v_g.org_id AND n.resource_id = p_sitting_id
                        AND n.event_type = 'exam_sitting.notice_emailed'
                        AND n.metadata ->> 'kind' = 'entry_auto_removed'
                        AND n.metadata ->> 'entry_id' = a.metadata ->> 'entry_id')
   ORDER BY a.created_at DESC
   LIMIT 200;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_pending_removal_notices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_removal_notices(uuid) TO authenticated;
