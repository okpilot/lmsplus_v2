-- get_pending_removal_notices also lists the emailed, unconsumed codes of a cancelled sitting (kind sitting_cancelled)
-- until a notice_emailed row with that kind and the code id exists. New columns: kind, code_id. Any sitting status.
DROP FUNCTION IF EXISTS public.get_pending_removal_notices(uuid);
CREATE FUNCTION public.get_pending_removal_notices(p_sitting_id uuid)
RETURNS TABLE(entry_id uuid, user_id uuid, subject_id uuid, passed_at timestamptz, removed_at timestamptz,
              kind text, code_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  -- security.md §15 exception (g): cancelled sittings are soft-deleted and stay readable
  SELECT * INTO v_s FROM public.exam_sittings s WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  RETURN QUERY
  SELECT r.entry_id, r.user_id, r.subject_id, r.passed_at, r.removed_at, r.kind, r.code_id
    FROM (
      SELECT (a.metadata ->> 'entry_id')::uuid AS entry_id, (a.metadata ->> 'user_id')::uuid AS user_id,
             (a.metadata ->> 'subject_id')::uuid AS subject_id, (a.metadata ->> 'passed_at')::timestamptz AS passed_at,
             a.created_at AS removed_at, 'entry_auto_removed'::text AS kind, NULL::uuid AS code_id
        FROM public.audit_events a
       WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
         AND a.event_type = 'exam_sitting.entry_auto_removed'
         AND NOT EXISTS (SELECT 1 FROM public.audit_events n
                          WHERE n.organization_id = v_g.org_id AND n.resource_id = p_sitting_id
                            AND n.event_type = 'exam_sitting.notice_emailed'
                            AND n.metadata ->> 'kind' = 'entry_auto_removed'
                            AND n.metadata ->> 'entry_id' = a.metadata ->> 'entry_id')
      UNION ALL
      SELECT e.id, c.student_id, c.subject_id, NULL::timestamptz, c.voided_at, 'sitting_cancelled'::text, c.id
        FROM public.internal_exam_codes c
        JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id AND e.organization_id = v_g.org_id
       WHERE v_s.status = 'cancelled' AND e.sitting_id = p_sitting_id AND c.organization_id = v_g.org_id
         AND c.deleted_at IS NULL AND c.consumed_at IS NULL AND c.voided_at IS NOT NULL
         AND c.void_reason = 'sitting_cancelled' AND c.emailed_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.audit_events n
                          WHERE n.organization_id = v_g.org_id AND n.resource_id = p_sitting_id
                            AND n.event_type = 'exam_sitting.notice_emailed'
                            AND n.metadata ->> 'kind' IN ('cancelled', 'sitting_cancelled')
                            AND n.metadata ->> 'code_id' = c.id::text)
    ) r
   ORDER BY r.removed_at DESC, r.kind, COALESCE(r.code_id, r.entry_id)
   LIMIT 200;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_pending_removal_notices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_removal_notices(uuid) TO authenticated;
