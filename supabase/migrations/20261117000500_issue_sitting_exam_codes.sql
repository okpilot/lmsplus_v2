-- issue_sitting_exam_codes: issues one code per entry from private.sitting_issue_plan. Admin only; counts only, no code value returned or audited.
-- p_user_ids / p_entry_ids NULL = all; both given = intersection. Prunes passed entries first.
-- Tokens: sitting_not_found, sitting_closed, sitting_day_ended, entry_not_found, invalid_input.
CREATE OR REPLACE FUNCTION public.issue_sitting_exam_codes(
  p_sitting_id uuid, p_user_ids uuid[] DEFAULT NULL, p_entry_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(issued int, reissued_after_expiry int, skipped_already_issued int, skipped_attempt_taken int,
              skipped_no_config int, skipped_deactivated int, skipped_not_enrolled int, skipped_passed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_users uuid[];
  v_entries uuid[];
  v_pruneable uuid[];
  v_p record;
  v_expiry timestamptz;
  v_new uuid;
  v_issued int := 0;
  v_reissued int := 0;
  v_already int := 0;
  v_attempt int := 0;
  v_noconf int := 0;
  v_deact int := 0;
  v_unenr int := 0;
  v_passed int := 0;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();

  -- Shape before the lock.
  IF p_user_ids IS NOT NULL AND (array_position(p_user_ids, NULL) IS NOT NULL OR cardinality(p_user_ids) = 0
       OR (SELECT count(DISTINCT x) FROM unnest(p_user_ids) x) > 500) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF p_entry_ids IS NOT NULL THEN
    IF array_position(p_entry_ids, NULL) IS NOT NULL OR cardinality(p_entry_ids) = 0 THEN
      RAISE EXCEPTION 'invalid_input';
    END IF;
    v_entries := ARRAY(SELECT DISTINCT x FROM unnest(p_entry_ids) x);
    IF cardinality(v_entries) > 500 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  END IF;

  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);
  v_users := private.sitting_resolve_user_ids(v_g.org_id, p_sitting_id, p_user_ids, 500);

  -- Entries in scope are captured before the prune: an entry the prune removes counts as passed.
  IF v_entries IS NOT NULL THEN
    IF (SELECT count(*) FROM public.exam_sitting_entries e
         WHERE e.id = ANY(v_entries) AND e.sitting_id = p_sitting_id
           AND e.organization_id = v_g.org_id AND e.deleted_at IS NULL) <> cardinality(v_entries) THEN
      RAISE EXCEPTION 'entry_not_found';
    END IF;
  END IF;
  v_pruneable := ARRAY(SELECT e.id FROM public.exam_sitting_entries e
                        WHERE e.sitting_id = p_sitting_id AND e.organization_id = v_g.org_id
                          AND e.deleted_at IS NULL AND e.user_id = ANY(v_users)
                          AND (v_entries IS NULL OR e.id = ANY(v_entries)));

  PERFORM private.prune_passed_entries(v_g.org_id, p_sitting_id, v_g.admin_id, v_g.admin_role);

  SELECT count(*)::int INTO v_passed FROM unnest(v_pruneable) x(id)
   WHERE NOT EXISTS (SELECT 1 FROM public.exam_sitting_entries e
                      WHERE e.id = x.id AND e.organization_id = v_g.org_id AND e.deleted_at IS NULL);

  v_expiry := private.sitting_code_expiry(v_s.scheduled_at);

  FOR v_p IN SELECT * FROM private.sitting_issue_plan(v_g.org_id, p_sitting_id, v_users, v_entries)
              ORDER BY entry_id LOOP
    IF v_p.action = 'skip' THEN
      CASE v_p.reason
        WHEN 'already_issued' THEN v_already := v_already + 1;
        WHEN 'attempt_taken' THEN v_attempt := v_attempt + 1;
        WHEN 'passed' THEN v_passed := v_passed + 1;
        WHEN 'deactivated' THEN v_deact := v_deact + 1;
        WHEN 'no_longer_enrolled' THEN v_unenr := v_unenr + 1;
        ELSE v_noconf := v_noconf + 1;
      END CASE;
      CONTINUE;
    END IF;
    IF v_p.action = 'reissue_after_expiry' THEN
      UPDATE public.internal_exam_codes c
         SET voided_at = now(), voided_by = v_g.admin_id, void_reason = 'reissued_after_expiry'
       WHERE c.id = v_p.old_code_id AND c.organization_id = v_g.org_id
         AND c.consumed_at IS NULL AND c.voided_at IS NULL AND c.deleted_at IS NULL;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      INSERT INTO public.audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'internal_exam.code_voided', 'internal_exam_code', v_p.old_code_id,
        jsonb_build_object('reason', 'reissued_after_expiry', 'was_consumed', false, 'sitting_id', p_sitting_id,
                           'entry_id', v_p.entry_id, 'student_id', v_p.user_id, 'subject_id', v_p.subject_id));
      v_reissued := v_reissued + 1;
    END IF;
    v_new := private.insert_internal_exam_code(v_g.org_id, v_p.entry_id, v_p.subject_id, v_p.user_id, v_g.admin_id, v_expiry);
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'internal_exam.code_issued', 'internal_exam_code', v_new,
      jsonb_build_object('sitting_id', p_sitting_id, 'entry_id', v_p.entry_id, 'subject_id', v_p.subject_id,
                         'student_id', v_p.user_id, 'expires_at', v_expiry));
    v_issued := v_issued + 1;
  END LOOP;

  RETURN QUERY SELECT v_issued, v_reissued, v_already, v_attempt, v_noconf, v_deact, v_unenr, v_passed;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.issue_sitting_exam_codes(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_sitting_exam_codes(uuid, uuid[], uuid[]) TO authenticated;
