-- Tighten internal_exam_codes RLS surface.
-- Closes #577 (student plaintext-code read path) and #578 (admin direct UPDATE
-- policy with zero production callers).
--
-- Student reads now go through list_my_active_internal_exam_codes RPC only.
-- Admin reads still use the surviving admin_read_org_codes policy (used by
-- apps/web/app/app/admin/internal-exams/queries.ts).
-- Admin writes still go through issue_internal_exam_code / void_internal_exam_code
-- SECURITY DEFINER RPCs only.

DROP POLICY IF EXISTS student_read_active_codes ON public.internal_exam_codes;
DROP POLICY IF EXISTS admin_update_org_codes ON public.internal_exam_codes;

REVOKE UPDATE ON public.internal_exam_codes FROM authenticated;
