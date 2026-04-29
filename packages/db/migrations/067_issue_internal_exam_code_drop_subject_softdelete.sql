-- Migration 067: Drop non-existent easa_subjects.deleted_at filter
-- CodeRabbit PR #576 finding #30 (CRITICAL).
-- mig 059 line 60 references `s.deleted_at IS NULL` on `public.easa_subjects`,
-- but that table has no `deleted_at` column. The RPC throws
-- `column "deleted_at" does not exist` at runtime, breaking every code-issuance
-- attempt. Forward fix: re-CREATE OR REPLACE with the predicate removed.
-- All other filters (org match, role check on student, exam_config check,
-- code-generation loop, audit insert) preserved verbatim.
-- security.md rules 7, 9, 10 — auth.uid() check, deleted_at filters on every
-- SELECT (including the audit-row subqueries), generic error codes only.

CREATE OR REPLACE FUNCTION public.issue_internal_exam_code(
  p_subject_id uuid,
  p_student_id uuid
)
RETURNS TABLE(code_id uuid, code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_admin_org  uuid;
  v_student_org uuid;
  v_charset    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_charset_len int  := length('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  v_code       text;
  v_new_id     uuid;
  v_new_expiry timestamptz;
  v_attempt    int := 0;
  v_inserted   boolean := false;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Resolve admin's organization.
  SELECT u.organization_id INTO v_admin_org
  FROM public.users u
  WHERE u.id = v_admin_id
    AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Verify student exists in same org with role='student'.
  SELECT u.organization_id INTO v_student_org
  FROM public.users u
  WHERE u.id = p_student_id
    AND u.role = 'student'
    AND u.deleted_at IS NULL;
  IF v_student_org IS NULL OR v_student_org <> v_admin_org THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  -- Verify subject exists. easa_subjects has no deleted_at column.
  IF NOT EXISTS (
    SELECT 1 FROM public.easa_subjects s
    WHERE s.id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'subject_not_found';
  END IF;

  -- Verify an enabled exam_config exists for (admin_org, subject).
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_configs ec
    WHERE ec.organization_id = v_admin_org
      AND ec.subject_id = p_subject_id
      AND ec.enabled = true
      AND ec.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'exam_config_required';
  END IF;

  v_new_expiry := now() + interval '24 hours';

  -- Generate + insert with up-to-5 retry on unique-violation.
  WHILE v_attempt < 5 AND NOT v_inserted LOOP
    v_attempt := v_attempt + 1;
    v_code := array_to_string(
      ARRAY(
        SELECT substr(v_charset, 1 + floor(random() * v_charset_len)::int, 1)
        FROM generate_series(1, 8)
      ),
      ''
    );
    BEGIN
      INSERT INTO public.internal_exam_codes
        (code, subject_id, student_id, issued_by, expires_at, organization_id)
      VALUES
        (v_code, p_subject_id, p_student_id, v_admin_id, v_new_expiry, v_admin_org)
      RETURNING id INTO v_new_id;
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      -- Retry with a fresh code.
      v_inserted := false;
    END;
  END LOOP;

  IF NOT v_inserted THEN
    RAISE EXCEPTION 'code_generation_failed';
  END IF;

  -- Audit. Subquery on users filters deleted_at (security.md rule 10).
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_admin_org,
    v_admin_id,
    (SELECT u.role FROM public.users u
     WHERE u.id = v_admin_id AND u.deleted_at IS NULL),
    'internal_exam.code_issued',
    'internal_exam_code',
    v_new_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'subject_id', p_subject_id,
      'expires_at', v_new_expiry
    )
  );

  RETURN QUERY SELECT v_new_id, v_code, v_new_expiry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_internal_exam_code(uuid, uuid) TO authenticated;
