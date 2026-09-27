import { getAdminClient } from './supabase'

/**
 * Fetches a valid recovery code for `email` via the admin API, bypassing
 * email delivery entirely — CI has no `RESEND_API_KEY`, so the app's own
 * send fails closed while the forgot-password page stays neutral either way.
 *
 * `generateLink({ type: 'recovery' })` rotates the account's recovery OTP,
 * so the code this returns is the one the app will accept next — call it
 * AFTER the UI's step-1 submit, not before, or the app's own generated code
 * invalidates this one.
 */
export async function fetchRecoveryCode(email: string): Promise<string> {
  const admin = getAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  if (error) throw new Error(`fetchRecoveryCode: ${error.message}`)
  const code = data?.properties?.email_otp
  if (!code) throw new Error('fetchRecoveryCode: no email_otp on generateLink response')
  return code
}
