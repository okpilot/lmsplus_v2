-- Migration 057: user_consents — append-only GDPR consent audit log
-- Pattern: same as audit_events (immutable, INSERT via SECURITY DEFINER RPC only)

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE user_consents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id),
  document_type    TEXT        NOT NULL CHECK (document_type IN (
                     'terms_of_service', 'privacy_policy', 'cookie_analytics')),
  document_version TEXT        NOT NULL CHECK (char_length(document_version) BETWEEN 1 AND 20),
  accepted         BOOLEAN     NOT NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents FORCE ROW LEVEL SECURITY;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

-- Users can read their own consent records
CREATE POLICY user_consents_select_own ON user_consents
  FOR SELECT USING (user_id = auth.uid());

-- No direct client inserts — must go through record_consent() RPC
CREATE POLICY user_consents_no_direct_insert ON user_consents
  FOR INSERT WITH CHECK (false);

-- Append-only: no updates, no deletes
CREATE POLICY user_consents_no_update ON user_consents
  FOR UPDATE USING (false);

CREATE POLICY user_consents_no_delete ON user_consents
  FOR DELETE USING (false);

-- ── Index ────────────────────────────────────────────────────────────────────

CREATE INDEX idx_user_consents_lookup
  ON user_consents (user_id, document_type, document_version)
  WHERE accepted = true;

-- ── RPC: record_consent ──────────────────────────────────────────────────────
-- Records a single consent decision. Called once per document type.

CREATE FUNCTION record_consent(
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
  IF p_document_type NOT IN ('terms_of_service', 'privacy_policy', 'cookie_analytics') THEN
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

-- ── RPC: check_consent_status ────────────────────────────────────────────────
-- Returns whether the user has accepted the specified versions of TOS and privacy policy.
-- Used by login-complete to decide whether to redirect to /consent.

CREATE FUNCTION check_consent_status(
  p_tos_version     TEXT,
  p_privacy_version TEXT
)
RETURNS TABLE(has_tos BOOLEAN, has_privacy BOOLEAN)
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

  -- Verify user exists and is not soft-deleted
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = _uid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM user_consents
      WHERE user_id = _uid
        AND document_type = 'terms_of_service'
        AND document_version = p_tos_version
        AND accepted = true
    ) AS has_tos,
    EXISTS (
      SELECT 1 FROM user_consents
      WHERE user_id = _uid
        AND document_type = 'privacy_policy'
        AND document_version = p_privacy_version
        AND accepted = true
    ) AS has_privacy;
END;
$$;

GRANT EXECUTE ON FUNCTION check_consent_status(TEXT, TEXT) TO authenticated;
