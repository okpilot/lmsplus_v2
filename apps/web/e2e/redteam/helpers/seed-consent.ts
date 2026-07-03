import { getAdminClient } from '../../helpers/supabase'

// user_consents isolation spec (#384): document_version markers for the rows it seeds.
export const USER_CONSENTS_SEED_VERSION = 'redteam-x-1.0'
export const USER_CONSENTS_SELF_VERSION = 'redteam-x-self'
export const USER_CONSENTS_FORGED_VERSION = 'redteam-y-forged'
// user_consents idempotency spec (#386): distinct version so the afterAll cleanup
// can sweep it along with the other fixture rows.
export const USER_CONSENTS_IDEMPOTENCY_VERSION = 'redteam-idem-1.0'

/**
 * Insert valid user_consents rows (TOS + privacy_policy) for `userId` using
 * the current consent versions from versions.ts. Service-role client bypasses
 * the `user_consents_no_direct_insert WITH CHECK(false)` RLS policy.
 *
 * Used by consent-gate.spec.ts (Vector Z) to give a user consent without going
 * through the UI flow, so the /auth/login-complete route can be tested in its
 * "consent satisfied → /app/dashboard" branch.
 *
 * The inserted rows use `CURRENT_TOS_VERSION` / `CURRENT_PRIVACY_VERSION` from
 * versions.ts so the check_consent_status RPC (which checks those exact versions)
 * returns `has_tos=true, has_privacy=true`.
 *
 * Cleanup: caller is responsible for deleting rows seeded by this helper.
 * The spec uses afterAll with `.eq('user_id', userId)` + `.in('document_version',
 * [CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION])` to stay hermetic.
 */
export async function seedConsentRecords(userId: string): Promise<void> {
  const { CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION } = await import(
    '../../../lib/consent/versions'
  )
  const admin = getAdminClient()

  const toInsert = [
    {
      user_id: userId,
      document_type: 'terms_of_service' as const,
      document_version: CURRENT_TOS_VERSION,
      accepted: true,
    },
    {
      user_id: userId,
      document_type: 'privacy_policy' as const,
      document_version: CURRENT_PRIVACY_VERSION,
      accepted: true,
    },
  ]

  const { data, error } = await admin.from('user_consents').insert(toInsert).select('id')
  if (error) throw new Error(`seedConsentRecords: insert failed: ${error.message}`)
  if (data?.length !== 2) {
    throw new Error(`seedConsentRecords: expected 2 inserted rows, got ${data?.length ?? 0}`)
  }
}
