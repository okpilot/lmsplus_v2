-- Migration: internal_exam_codes — add emailed_at + stamp it in
-- record_internal_exam_code_emailed (#905).
--
-- #905 surfaces a per-row "Send email" button + a "sent" indicator on the admin
-- codes table. The indicator is driven by a new nullable emailed_at column.
-- The existing audit RPC record_internal_exam_code_emailed (mig 110) — already
-- the single SECURITY DEFINER path invoked after a successful send — is extended
-- to ALSO stamp emailed_at = now(). No new RPC or write path is introduced.
--
-- The full guard set from mig 110 is preserved verbatim (security.md rule 11b):
--   rule 7 auth.uid() null-check, is_admin() gate, active-user gate + rule 9
--   (org/role in one deleted_at-filtered read), rule 9 org-scoped + deleted_at +
--   state-guarded code ownership read, rule 10 (no inline audit subqueries),
--   SET search_path = public. The new UPDATE runs only AFTER the code_not_found
--   RAISE, so a cross-org / soft-deleted / consumed / voided / expired code is
--   never stamped. The UPDATE re-asserts the FULL guard set in its own WHERE
--   (PK + organization_id + deleted_at + un-consumed/un-voided/unexpired) so a
--   state change racing between the ownership SELECT and the UPDATE cannot stamp
--   an invalidated code (defense-in-depth; the SELECT above already proved them).

ALTER TABLE public.internal_exam_codes ADD COLUMN emailed_at timestamptz;

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
  -- soft-deleted (rule 9). State guard: the code must also be un-consumed,
  -- un-voided, and unexpired (defense-in-depth — the Server Action already
  -- checks these; a code failing any check is hidden behind code_not_found).
  -- Read student_id/subject_id for the audit metadata.
  SELECT c.student_id, c.subject_id INTO v_student_id, v_subject_id
  FROM public.internal_exam_codes c
  WHERE c.id = p_code_id
    AND c.organization_id = v_admin_org
    AND c.deleted_at IS NULL
    AND c.consumed_at IS NULL
    AND c.voided_at IS NULL
    AND c.expires_at > now();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  -- #905: stamp the last-emailed time so the admin codes table can show a
  -- "sent" indicator. Reached only for a code already proven owned, active, and
  -- non-deleted above. The WHERE re-asserts the FULL ownership + active-state
  -- guard set (PK + org + deleted_at + un-consumed/un-voided/unexpired) so a
  -- state change racing between the SELECT above and this UPDATE cannot stamp an
  -- invalidated code; a lost race simply no-ops (emailed_at stays NULL — the
  -- accepted under-report, never over-report) and the audit below still records
  -- the email that was already sent.
  UPDATE public.internal_exam_codes
  SET emailed_at = now()
  WHERE id = p_code_id
    AND organization_id = v_admin_org
    AND deleted_at IS NULL
    AND consumed_at IS NULL
    AND voided_at IS NULL
    AND expires_at > now();

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
