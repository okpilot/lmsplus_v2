-- Inserts one sitting code: 8 chars, up to 5 draws on a code-string collision.
-- A unique violation on the per-entry index (a live code already exists) is re-raised, not retried. Callers audit.
CREATE OR REPLACE FUNCTION private.insert_internal_exam_code(
  p_org uuid, p_entry_id uuid, p_subject_id uuid, p_student_id uuid, p_actor uuid, p_expiry timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len int := length('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  v_code text;
  v_id uuid;
  v_attempt int := 0;
BEGIN
  WHILE v_attempt < 5 LOOP
    v_attempt := v_attempt + 1;
    v_code := array_to_string(
      ARRAY(SELECT substr(v_charset, 1 + floor(random() * v_len)::int, 1) FROM generate_series(1, 8)), '');
    BEGIN
      INSERT INTO public.internal_exam_codes
        (code, subject_id, student_id, issued_by, expires_at, organization_id, sitting_entry_id)
      VALUES (v_code, p_subject_id, p_student_id, p_actor, p_expiry, p_org, p_entry_id)
      RETURNING id INTO v_id;
      RETURN v_id;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM public.internal_exam_codes c
                  WHERE c.sitting_entry_id = p_entry_id AND c.deleted_at IS NULL
                    AND (c.voided_at IS NULL OR c.consumed_at IS NOT NULL)) THEN
        RAISE;
      END IF;
    END;
  END LOOP;
  RAISE EXCEPTION 'code_generation_failed';
END;
$$;
REVOKE EXECUTE ON FUNCTION private.insert_internal_exam_code(uuid, uuid, uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
