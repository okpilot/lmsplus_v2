-- Migration 085: record_consent — ON CONFLICT idempotency for accepted=true rows (#386)
--
-- A retried consent submission (network retry, double-click, tab restore) currently
-- inserts a duplicate accepted=true row into user_consents, polluting the GDPR audit
-- trail with phantom re-consent events. The partial unique index
-- idx_user_consents_lookup (user_id, document_type, document_version) WHERE accepted=true
-- already exists (mig 057) — wire it to ON CONFLICT DO NOTHING so repeat calls for
-- the same (user, type, version, accepted=true) triple are silent no-ops.
--
-- Only the INSERT statement changes; all guards (auth.uid() check, document_type
-- whitelist, soft-deleted-user check) and all function attributes are preserved verbatim.

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
  VALUES (_uid, p_document_type, p_document_version, p_accepted, p_ip_address, p_user_agent)
  ON CONFLICT (user_id, document_type, document_version) WHERE accepted = true DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION record_consent(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
