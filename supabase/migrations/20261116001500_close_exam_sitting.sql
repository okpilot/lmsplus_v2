-- close_exam_sitting. Calls the shared core with automatic = false.
CREATE OR REPLACE FUNCTION public.close_exam_sitting(p_sitting_id uuid)
RETURNS TABLE(closed_at timestamptz, codes_voided int, attempts_running int, absent_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_r record;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, false);
  IF v_s.status <> 'open' THEN RAISE EXCEPTION 'sitting_not_open'; END IF;
  SELECT * INTO v_r FROM private.close_exam_sitting_core(p_sitting_id, v_g.admin_id, v_g.admin_role, false);
  RETURN QUERY SELECT v_r.closed_at, v_r.codes_voided, v_r.attempts_running, v_r.absent_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.close_exam_sitting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_exam_sitting(uuid) TO authenticated;
