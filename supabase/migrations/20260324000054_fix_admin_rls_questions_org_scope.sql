-- Fix: admin RLS policies on questions must enforce tenant isolation.
-- Migration 052 created policies with only is_admin() check, which bypasses
-- organization scoping (permissive policies combine with OR in Postgres).
-- This migration adds organization_id matching to prevent cross-org writes.

DROP POLICY admin_insert_questions ON public.questions;
DROP POLICY admin_update_questions ON public.questions;

CREATE POLICY admin_insert_questions ON public.questions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY admin_update_questions ON public.questions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );
