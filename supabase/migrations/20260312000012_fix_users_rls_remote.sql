-- Fix: users RLS infinite recursion on remote database
-- Migration 004 was recorded as applied in the remote migration tracker
-- but the SQL did not execute — tenant_isolation policy remained in place.
-- This migration re-applies the fix so remote matches local.
--
-- Root cause: tenant_isolation used a self-referencing subquery:
--   organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
-- which caused "infinite recursion detected in policy for relation users"
-- whenever the users table was queried (e.g. auth callback profile lookup).

DROP POLICY IF EXISTS tenant_isolation ON public.users;
DROP POLICY IF EXISTS users_select ON public.users;

CREATE POLICY users_select ON public.users
  FOR SELECT
  USING (id = auth.uid() AND deleted_at IS NULL);
