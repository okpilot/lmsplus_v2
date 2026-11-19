-- list_exam_sitting_removed_entries: entries removed automatically because the student passed. Admin only; STABLE; any sitting status.
-- Newest first, <=200 rows; total_count counts all. student_name is '' when the audited user is not in the caller's org.
-- no_notice: unsent and the student gets no notice (not in private.pending_notice_rows: not active in the org or no email).
-- Tokens: sitting_not_found.
DROP FUNCTION IF EXISTS public.list_exam_sitting_removed_entries(uuid);
CREATE FUNCTION public.list_exam_sitting_removed_entries(p_sitting_id uuid)
RETURNS TABLE(entry_id uuid, user_id uuid, student_name text, subject_short text,
              passed_at timestamptz, removed_at timestamptz, notice_sent boolean, no_notice boolean, total_count bigint)
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
  WITH pend AS (SELECT p.entry_id FROM private.pending_notice_rows(v_g.org_id, p_sitting_id, false) p
                 WHERE p.kind = 'entry_auto_removed')
  SELECT x.entry_id, x.user_id, x.student_name, x.subject_short, x.passed_at, x.removed_at, x.notice_sent,
         NOT x.notice_sent AND NOT EXISTS (SELECT 1 FROM pend WHERE pend.entry_id = x.entry_id), x.total_count
    FROM (
  SELECT (a.metadata ->> 'entry_id')::uuid AS entry_id, (a.metadata ->> 'user_id')::uuid AS user_id,
         COALESCE(u.full_name, u.email, '') AS student_name, sj.short AS subject_short,
         (a.metadata ->> 'passed_at')::timestamptz AS passed_at, a.created_at AS removed_at,
         EXISTS (SELECT 1 FROM public.audit_events n
                  WHERE n.organization_id = v_g.org_id AND n.resource_id = p_sitting_id
                    AND n.event_type = 'exam_sitting.notice_emailed' AND n.metadata ->> 'kind' = 'entry_auto_removed'
                    AND n.metadata ->> 'entry_id' = a.metadata ->> 'entry_id') AS notice_sent,
         count(*) OVER () AS total_count, a.id AS audit_id
    FROM public.audit_events a
    -- security.md §15 exception (f): the removed student may be deactivated
    LEFT JOIN public.users u ON u.id = (a.metadata ->> 'user_id')::uuid AND u.organization_id = v_g.org_id
    LEFT JOIN public.easa_subjects sj ON sj.id = (a.metadata ->> 'subject_id')::uuid AND sj.deleted_at IS NULL
   WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
     AND a.event_type = 'exam_sitting.entry_auto_removed'
   ORDER BY a.created_at DESC, a.id
   LIMIT 200
    ) x
   ORDER BY x.removed_at DESC, x.audit_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_exam_sitting_removed_entries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exam_sitting_removed_entries(uuid) TO authenticated;
