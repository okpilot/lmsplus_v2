import { getAdminClient } from './supabase'

const APP_SEND_SETTLE_MS = 3_000
const POLL_MS = 200

/**
 * Fetches a valid recovery code for `email` via the admin API, bypassing
 * email delivery entirely — CI has no `RESEND_API_KEY`, so the app's own
 * send fails closed while the forgot-password page stays neutral either way.
 *
 * `generateLink({ type: 'recovery' })` rotates the account's recovery OTP,
 * so call this AFTER the UI's step-1 submit. The app sends from `after()`,
 * so its own `generateLink` can still be in flight when step 2 renders:
 * wait for `recovery_sent_at` to move (or the settle window to pass) first,
 * or the app's code would invalidate this one.
 */
export async function fetchRecoveryCode(email: string): Promise<string> {
  const admin = getAdminClient()
  await waitForAppSend(email)
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  if (error) throw new Error(`fetchRecoveryCode: ${error.message}`)
  const code = data?.properties?.email_otp
  if (!code) throw new Error('fetchRecoveryCode: no email_otp on generateLink response')
  return code
}

/** Waits until the app's own `after()` send has rotated the OTP, or the settle window passes. */
async function waitForAppSend(email: string): Promise<void> {
  const userId = await readUserId(email)
  const before = await readRecoverySentAt(userId)
  const deadline = Date.now() + APP_SEND_SETTLE_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    if ((await readRecoverySentAt(userId)) !== before) return
  }
}

async function readUserId(email: string): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`fetchRecoveryCode user (${email}): ${error.message}`)
  if (!data) throw new Error(`fetchRecoveryCode: no user row for ${email}`)
  return data.id
}

async function readRecoverySentAt(userId: string): Promise<string | null> {
  const { data, error } = await getAdminClient().auth.admin.getUserById(userId)
  if (error) throw new Error(`fetchRecoveryCode getUserById: ${error.message}`)
  return data.user?.recovery_sent_at ?? null
}
