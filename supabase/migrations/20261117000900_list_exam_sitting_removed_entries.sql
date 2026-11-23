-- list_exam_sitting_removed_entries: entries removed automatically because the student passed. Admin only; STABLE; any sitting status.
-- Newest first, <=200 rows; total_count counts all. student_name is '' when the audited user is not in the caller's org.
-- Tokens: sitting_not_found.
CREATE OR REPLACE FUNCTION public.list_exam_sitting_removed_entries(p_sitting_id uuid)
RETURNS TABLE(entry_id uuid, user_id uuid, student_name text, subject_short text,
              passed_at timestamptz, removed_at timestamptz, notice_sent boolean, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  -- No deleted_at filter: cancelled sittings stay readable for admins (security.md §15).
  -- security.md §15 exception (g): cancelled sittings are soft-deleted and stay readable
  PERFORM 1 FROM public.exam_sittings s WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  RETURN QUERY
  SELECT (a.metadata ->> 'entry_id')::uuid, (a.metadata ->> 'user_id')::uuid,
         COALESCE(u.full_name, u.email, ''), sj.short, (a.metadata ->> 'passed_at')::timestamptz,
         a.created_at,
         EXISTS (SELECT 1 FROM public.audit_events n
                  WHERE n.organization_id = v_g.org_id AND n.resource_id = p_sitting_id
                    AND n.event_type = 'exam_sitting.notice_emailed' AND n.metadata ->> 'kind' = 'entry_auto_removed'
                    AND n.metadata ->> 'entry_id' = a.metadata ->> 'entry_id'),
         count(*) OVER ()
    FROM public.audit_events a
    -- security.md §15 exception (f): the removed student may be deactivated
    LEFT JOIN public.users u ON u.id = (a.metadata ->> 'user_id')::uuid AND u.organization_id = v_g.org_id
    LEFT JOIN public.easa_subjects sj ON sj.id = (a.metadata ->> 'subject_id')::uuid AND sj.deleted_at IS NULL
   WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
     AND a.event_type = 'exam_sitting.entry_auto_removed'
   ORDER BY a.created_at DESC, a.id
   LIMIT 200;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_exam_sitting_removed_entries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exam_sitting_removed_entries(uuid) TO authenticated;
