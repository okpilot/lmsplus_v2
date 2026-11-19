-- get_pending_removal_notices: deliverable rows only (private.pending_notice_rows), capped by whole students (<= 200 rows, first student always whole).
CREATE OR REPLACE FUNCTION public.get_pending_removal_notices(p_sitting_id uuid)
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
  WITH rows AS (
    SELECT * FROM private.pending_notice_rows(v_g.org_id, p_sitting_id, v_s.status = 'cancelled')
  ), per_user AS (
    SELECT x.user_id, count(*) AS n FROM rows x GROUP BY x.user_id
  ), kept AS (
    SELECT p.user_id FROM (SELECT q.user_id, sum(q.n) OVER (ORDER BY q.user_id) AS cum,
                                  row_number() OVER (ORDER BY q.user_id) AS rn FROM per_user q) p
     WHERE p.cum <= 200 OR p.rn = 1
  )
  SELECT x.entry_id, x.user_id, x.subject_id, x.passed_at, x.removed_at, x.kind, x.code_id
    FROM rows x JOIN kept k ON k.user_id = x.user_id
   ORDER BY x.user_id, x.kind, x.removed_at DESC, COALESCE(x.code_id, x.entry_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_pending_removal_notices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_removal_notices(uuid) TO authenticated;
