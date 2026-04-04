-- Enforce 1:1 org-bank invariant at DB level.
-- Makes insertQuestion's .limit(1).single() deterministic by ensuring
-- there can never be more than one question_banks row per organization.
--
-- Safe to re-run: the DO block catches duplicate_object (42710),
-- which Postgres raises when the named constraint already exists.

DO $$
BEGIN
  ALTER TABLE public.question_banks
    ADD CONSTRAINT question_banks_organization_id_key UNIQUE (organization_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- constraint already exists, nothing to do
END;
$$;
