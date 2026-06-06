-- Migration 090: REVOKE blanket UPDATE on public.users from authenticated and
-- re-GRANT only the safe columns (#773).
--
-- #773 (HIGH). The `users_update_own` RLS policy (mig 20260326000056) scopes
-- ROWS (id = auth.uid() AND deleted_at IS NULL) but not COLUMNS, and
-- `trg_protect_users_sensitive_columns` (mig 20260316000041) fires BEFORE UPDATE
-- OF role, organization_id, deleted_at — but only when those columns are
-- included in the UPDATE target list. That left role, organization_id, and
-- deleted_at writable by a student's authenticated PostgREST connection at the
-- privilege layer (rejected late, by the trigger, not early).
--
-- Fix at the privilege layer (defense-in-depth precedent: mig 079/085 for
-- quiz_sessions scoring columns via 20260605000001). Revoke the blanket UPDATE
-- and re-GRANT only the single column a student legitimately self-writes:
--
--   * full_name — the only column mutated by an authenticated (non-admin) path.
--     Source: apps/web/app/app/settings/actions.ts:32,
--             updateDisplayName Server Action, uses createServerSupabaseClient()
--             (browser session, not service role).
--
-- Intentionally OMITTED from the re-GRANT:
--   * role, organization_id, deleted_at — the trigger already blocks these, but
--     the privilege revoke now rejects them before RLS/trigger evaluation.
--     Admin writes (updateStudent, toggleStudentStatus) use adminClient (service
--     role), which bypasses column-level grants entirely.
--   * deleted_by — set only by toggleStudentStatus via adminClient (service role).
--   * last_active_at — stamped only by SECURITY DEFINER RPCs (complete_quiz_session,
--     batch_submit_quiz — mig 20260406000004). SECURITY DEFINER runs as the
--     function owner (postgres), which is not subject to authenticated grants.
--   * email — set only by adminClient paths (create-student, GDPR export). Never
--     self-updated by authenticated user.
--   * id, created_at — PKs/audit fields never updated by any path.

REVOKE UPDATE ON public.users FROM authenticated;

GRANT UPDATE (full_name) ON public.users TO authenticated;
