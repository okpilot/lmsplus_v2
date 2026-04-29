-- Migration 064: Force RLS on internal_exam_codes
-- Closes a defense-in-depth gap caught in semantic review of commit 10b27cc.
-- Without FORCE, the table owner role bypasses policies during admin tooling,
-- migration scripts, or service-role queries (see docs/security.md §3).

ALTER TABLE public.internal_exam_codes FORCE ROW LEVEL SECURITY;
