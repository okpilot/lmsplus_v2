-- Migration 058: Remove cookie_analytics consent type (never used, no analytics cookies)

-- ── Cleanup: delete any existing cookie_analytics rows ───────────────────────
-- Safe to hard-delete here: migration runs as superuser (bypasses user_consents RLS).
-- In practice this type was never inserted (analytics checkbox removed before any user
-- accepted it). This is a one-time schema correction, not a pattern for application code.

DELETE FROM user_consents WHERE document_type = 'cookie_analytics';

-- ── Drop old CHECK constraint and recreate without cookie_analytics ───────────
-- The inline CHECK on document_type gets an auto-generated constraint name, so
-- we look it up from pg_constraint before dropping it.

DO $$
DECLARE
  _constraint_name TEXT;
BEGIN
  SELECT conname INTO _constraint_name
  FROM pg_constraint
  WHERE conrelid = 'user_consents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%cookie_analytics%';

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_consents DROP CONSTRAINT %I', _constraint_name);
  END IF;
END;
$$;

ALTER TABLE user_consents ADD CONSTRAINT user_consents_document_type_check
  CHECK (document_type IN ('terms_of_service', 'privacy_policy'));

-- ── RPC: record_consent (updated — cookie_analytics removed) ─────────────────

CREATE OR REPLACE FUNCTION record_consent(
  p_document_type    TEXT,
  p_document_version TEXT,
  p_accepted         BOOLEAN,
  p_ip_address       TEXT DEFAULT NULL,
  p_user_agent       TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate document_type (defense-in-depth — SECURITY DEFINER bypasses CHECK in some PG versions)
  IF p_document_type NOT IN ('terms_of_service', 'privacy_policy') THEN
    RAISE EXCEPTION 'Invalid document_type: %', p_document_type;
  END IF;

  -- Verify user exists and is not soft-deleted
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = _uid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO user_consents (user_id, document_type, document_version, accepted, ip_address, user_agent)
  VALUES (_uid, p_document_type, p_document_version, p_accepted, p_ip_address, p_user_agent);
END;
$$;

GRANT EXECUTE ON FUNCTION record_consent(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
