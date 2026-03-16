# Supabase RLS Patterns — LMS Plus v2

## Every table needs BOTH policies
```sql
-- ✅ CORRECT: both USING (read) and WITH CHECK (write)
CREATE POLICY "students can read own data"
  ON student_responses FOR SELECT
  USING (student_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "students can insert own data"
  ON student_responses FOR INSERT
  WITH CHECK (student_id = auth.uid());
```

## Soft delete filter in every policy
```sql
-- Every SELECT policy on soft-delete tables must include:
AND deleted_at IS NULL
```

## RPC pattern (SECURITY DEFINER)
```sql
CREATE OR REPLACE FUNCTION get_quiz_questions(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid(); -- manual auth check
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- strip correct answers from options
  -- ...
END;
$$;
```

## Multi-tenant isolation
Every table has `organization_id`. RLS policies always check it:
```sql
USING (organization_id = (
  SELECT organization_id FROM users WHERE id = auth.uid()
))
```
