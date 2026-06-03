-- Migration 083: filter the parent exam_configs.deleted_at in all three
-- exam_config_distributions RLS policies (#518).
--
-- The admin_select / admin_insert / admin_delete policies (mig 038) join back
-- to exam_configs checking organization_id + is_admin() but NOT
-- ec.deleted_at IS NULL. So distributions whose parent exam_config was
-- soft-deleted remain reachable via direct PostgREST access at the policy
-- layer. The admin UI masks this (queries.ts filters by live config IDs after
-- fetching), but the gap is one query away from exposure and accumulates over
-- time. Found by PR-level semantic review on PR #516.
--
-- Fix all three (sibling-audit rule): the SELECT, INSERT (WITH CHECK), and
-- DELETE policies share the identical EXISTS subquery and the identical gap.
-- upsert_exam_config is SECURITY DEFINER and bypasses RLS, so the atomic
-- replace-on-save flow is unaffected by tightening these policies.
--
-- Postgres has no CREATE OR REPLACE POLICY; DROP + CREATE mirrors the
-- precedent in 20260411000005_exam_config_security_fixes.sql.

DROP POLICY IF EXISTS admin_select_exam_distributions ON exam_config_distributions;
CREATE POLICY admin_select_exam_distributions ON exam_config_distributions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_configs ec
      WHERE ec.id = exam_config_distributions.exam_config_id
        AND ec.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND ec.deleted_at IS NULL
        AND public.is_admin()
    )
  );

DROP POLICY IF EXISTS admin_insert_exam_distributions ON exam_config_distributions;
CREATE POLICY admin_insert_exam_distributions ON exam_config_distributions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exam_configs ec
      WHERE ec.id = exam_config_distributions.exam_config_id
        AND ec.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND ec.deleted_at IS NULL
        AND public.is_admin()
    )
  );

DROP POLICY IF EXISTS admin_delete_exam_distributions ON exam_config_distributions;
CREATE POLICY admin_delete_exam_distributions ON exam_config_distributions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_configs ec
      WHERE ec.id = exam_config_distributions.exam_config_id
        AND ec.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND ec.deleted_at IS NULL
        AND public.is_admin()
    )
  );
