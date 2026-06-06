-- Migration 085: record_consent — idempotency guard for accepted=true rows (#386)
--
-- A retried consent submission (network retry, double-click, tab restore) currently
-- inserts a duplicate accepted=true row into user_consents, polluting the GDPR audit
-- trail with phantom re-consent events.
--
-- The existing idx_user_consents_lookup index (mig 057) is a NON-UNIQUE partial index,
-- so it cannot back an ON CONFLICT inference target. Converting it to UNIQUE would first
-- require hard-deleting any pre-existing duplicate accepted rows from a GDPR consent
-- table (a sensitive, hard-to-reverse data change — and the conversion would fail on any
-- DB that already holds the very duplicates this issue describes). Instead, guard the
-- INSERT with an EXISTS pre-check — the same idempotency idiom check_consent_status
-- already uses — so a repeated accepted=true call for the same (user, type, version)
-- triple is a silent no-op, with no schema change and no data deletion. Rejections
-- (accepted=false) remain unconditional inserts: each rejection is a distinct event.
--
-- This closes the reported sequential-retry scenario (TOS succeeds, privacy fails, user
-- retries). A truly-concurrent pair of identical calls could still both pass the EXISTS
-- check and insert two rows — but that is no worse than today's behaviour and is not the
-- reported failure mode; a unique index (with the dedup hazard above) would be required
-- to close that race, which this migration deliberately does not take on.
--
-- All guards (auth.uid() check, document_type whitelist, soft-deleted-user check) and
-- all function attributes are preserved verbatim.

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

  -- Idempotency (#386): a repeated acceptance of the same (type, version) is a no-op,
  -- so a retried submission does not append a duplicate accepted=true audit row.
  IF p_accepted AND EXISTS (
    SELECT 1 FROM user_consents
    WHERE user_id = _uid
      AND document_type = p_document_type
      AND document_version = p_document_version
      AND accepted = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO user_consents (user_id, document_type, document_version, accepted, ip_address, user_agent)
  VALUES (_uid, p_document_type, p_document_version, p_accepted, p_ip_address, p_user_agent);
END;
$$;

GRANT EXECUTE ON FUNCTION record_consent(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
