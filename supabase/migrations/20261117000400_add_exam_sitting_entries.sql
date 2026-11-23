-- add_exam_sitting_entries: explicit student x subject pairs into a scheduled/open sitting. Admin only.
-- Tokens: sitting_not_found, sitting_closed, sitting_day_ended, subject_not_found, exam_config_required, too_many_entries, invalid_input.
CREATE OR REPLACE FUNCTION public.add_exam_sitting_entries(
  p_sitting_id uuid, p_user_ids uuid[], p_subject_ids uuid[]
)
RETURNS TABLE(added int, skipped_existing int, skipped_not_candidate int, skipped_deactivated int,
              skipped_not_enrolled int, skipped_passed int, skipped_entered_elsewhere int,
              skipped_attempt_running int, skipped jsonb)
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
  IF p_user_ids IS NULL OR p_subject_ids IS NULL OR cardinality(p_user_ids) <> cardinality(p_subject_ids)
     OR cardinality(p_user_ids) = 0 OR array_position(p_user_ids, NULL) IS NOT NULL
     OR array_position(p_subject_ids, NULL) IS NOT NULL
     OR (SELECT count(*) FROM (SELECT DISTINCT a.u, a.s FROM unnest(p_user_ids, p_subject_ids) AS a(u, s)) d) > 1000 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);
  SELECT * INTO v_r FROM private.add_sitting_entries_core(
    v_g.org_id, p_sitting_id, p_user_ids, p_subject_ids, v_g.admin_id, v_g.admin_role);
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.entries_added', 'exam_sitting', p_sitting_id,
    jsonb_build_object('added', v_r.added, 'skipped_existing', v_r.skipped_existing,
      'skipped_not_candidate', v_r.skipped_not_candidate, 'skipped_deactivated', v_r.skipped_deactivated,
      'skipped_not_enrolled', v_r.skipped_not_enrolled, 'skipped_passed', v_r.skipped_passed,
      'skipped_entered_elsewhere', v_r.skipped_entered_elsewhere,
      'skipped_attempt_running', v_r.skipped_attempt_running));
  RETURN QUERY SELECT v_r.added, v_r.skipped_existing, v_r.skipped_not_candidate, v_r.skipped_deactivated,
    v_r.skipped_not_enrolled, v_r.skipped_passed, v_r.skipped_entered_elsewhere,
    v_r.skipped_attempt_running, v_r.skipped;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_exam_sitting_entries(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_exam_sitting_entries(uuid, uuid[], uuid[]) TO authenticated;
