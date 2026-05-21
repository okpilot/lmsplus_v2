-- list_my_active_internal_exam_codes()
-- Returns the current student's unconsumed, unvoided, unexpired internal-exam
-- codes WITHOUT the plaintext code value. Replaces the direct SELECT path
-- previously gated by the student_read_active_codes RLS policy (dropped in
-- migration 20260521000004). Closes issue #577.

CREATE OR REPLACE FUNCTION public.list_my_active_internal_exam_codes()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  expires_at timestamptz,
  issued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    iec.id,
    iec.subject_id,
    s.name,
    s.short,
    iec.expires_at,
    iec.issued_at
  FROM public.internal_exam_codes iec
  LEFT JOIN public.easa_subjects s
    ON s.id = iec.subject_id
    AND s.deleted_at IS NULL
  WHERE iec.student_id = v_user_id
    AND iec.consumed_at IS NULL
    AND iec.voided_at IS NULL
    AND iec.expires_at > now()
    AND iec.deleted_at IS NULL
  ORDER BY iec.expires_at ASC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_active_internal_exam_codes() TO authenticated;
