# Supabase RLS Patterns — LMS Plus v2

## Every table needs a policy per PERMITTED command

The clause is per command: `SELECT`/`DELETE` take `USING` only, `INSERT` takes `WITH CHECK` only,
`FOR ALL`/`FOR UPDATE` take both. A command with no permitting policy is denied by default — so on
an immutable table, a read-only policy set is correct by design, not a gap.

```sql
-- ✅ CORRECT: student_responses is IMMUTABLE — read policy only.
-- Rows are written solely by SECURITY DEFINER RPCs, which bypass RLS.
-- No deleted_at filter: immutable tables carry no deleted_at column.
CREATE POLICY "students_read_responses"
  ON student_responses FOR SELECT
  USING (student_id = auth.uid());

-- ❌ WRONG: never grant students a direct INSERT here. Exactly this policy
-- shipped in mig 20260311000005 and was dropped for security in
-- 20260311000006_restrict_immutable_inserts.sql.
-- CREATE POLICY "students_insert_responses"
--   ON student_responses FOR INSERT
--   WITH CHECK (student_id = auth.uid());
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
