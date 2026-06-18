-- Migration 110: record_internal_exam_code_emailed — audit an admin emailing an
-- internal exam code to a student (DB half of the "send exam code via email"
-- feature).
--
-- audit_events blocks direct INSERTs (policy audit_no_direct_insert =
-- WITH CHECK false), so the audit row must be written by a SECURITY DEFINER
-- function. This RPC writes one 'internal_exam.code_emailed' audit row scoped
-- to the admin's org and returns void.
--
-- Guard set mirrors the sibling internal-exam RPCs (issue/void/start —
-- latest bodies in migs 087, 084, 071) per security.md rule 11b:
--   * rule 7  — auth.uid() null-check (not_authenticated).
--   * is_admin() gate (not_admin).
--   * active-user gate + rule 9 — org AND role captured in ONE
--     deleted_at-filtered users read. The cached v_admin_role is reused in the
--     audit INSERT (mirrors mig 087); inlining a (SELECT u.role ...) subquery
--     would reverse that fix and need its own rule-10 deleted_at filter.
--   * rule 9  — internal_exam_codes ownership read is org-scoped and
--     deleted_at-filtered, also yielding the student_id/subject_id audit metadata.
--   * rule 10 — no inline audit subqueries; every value in the audit INSERT
--     comes from the deleted_at-filtered lookups above.
--   * SET search_path = public.

CREATE OR REPLACE FUNCTION public.record_internal_exam_code_emailed(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id    uuid := auth.uid();
  v_admin_org   uuid;
  v_admin_role  text;
  v_student_id  uuid;
  v_subject_id  uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Capture org AND role together in one deleted_at-filtered read at
  -- authorization time (active-user gate). The cached role is reused in the
  -- audit INSERT below so a mid-call soft-delete of the admin row cannot
  -- NULL-abort an already-authorised action (audit_events.actor_role is NOT
  -- NULL). Do NOT inline a (SELECT u.role ...) subquery (reverses mig 087).
  SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role
  FROM public.users u
  WHERE u.id = v_admin_id AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Ownership: the code must exist, belong to the admin's org, and not be
  -- soft-deleted (rule 9). Read student_id/subject_id for the audit metadata.
  SELECT c.student_id, c.subject_id INTO v_student_id, v_subject_id
  FROM public.internal_exam_codes c
  WHERE c.id = p_code_id
    AND c.organization_id = v_admin_org
    AND c.deleted_at IS NULL;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  -- Audit. Cached v_admin_role reused; no inline subquery (rule 10).
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_admin_org,
    v_admin_id,
    v_admin_role,
    'internal_exam.code_emailed',
    'internal_exam_code',
    p_code_id,
    jsonb_build_object(
      'student_id', v_student_id,
      'subject_id', v_subject_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_internal_exam_code_emailed(uuid) TO authenticated;
