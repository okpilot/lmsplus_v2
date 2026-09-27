'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { after } from 'next/server'
import { z } from 'zod'
import {
  claimRecoverySlot,
  findActiveUserIdByEmail,
  issueRecoveryCode,
  isVerifyLocked,
  recordFailedVerify,
} from '@/lib/auth/recovery-code'
import { setRecoveryPendingCookie } from '@/lib/auth/recovery-pending-cookie'
import { isEmailConfigured, sendEmail } from '@/lib/email/resend'
import { recoveryCodeEmail } from '@/lib/email/templates/recovery-code'
import { withMinimumDuration } from '@/lib/utils/with-minimum-duration'

// Auth lowercases addresses; users.email keeps the admin's original casing, so
// normalise the input and look it up case-insensitively.
const EmailSchema = z.string().trim().toLowerCase().email()

const RequestRecoveryCodeSchema = z.object({ email: EmailSchema })

export type RequestRecoveryCodeResult = { ok: true } | { ok: false; error: 'Invalid email' }

/** Step 1. Always `{ ok: true }` for valid input; the send runs in `after()` so no account enumeration. */
export async function requestRecoveryCode(input: unknown): Promise<RequestRecoveryCodeResult> {
  const parsed = RequestRecoveryCodeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid email' }
  const { email } = parsed.data

  const userId = await findActiveUserIdByEmail(email)
  if (!userId) return { ok: true }

  after(() => sendRecoveryCode(userId, email))
  return { ok: true }
}

/** Best-effort: every failure is logged and swallowed. */
async function sendRecoveryCode(userId: string, email: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.error('[requestRecoveryCode] email sending is not configured')
    return
  }

  const { allowed } = await claimRecoverySlot(userId)
  if (!allowed) return

  const code = await issueRecoveryCode(email)
  if (!code) return

  const sent = await sendEmail({ to: email, ...recoveryCodeEmail({ code }) })
  if (!sent.ok) {
    console.error('[requestRecoveryCode] send failed:', sent.error)
  }
}

const VerifyRecoveryCodeSchema = z.object({
  email: EmailSchema,
  code: z.string().regex(/^\d{6,10}$/),
})

const INVALID_CODE_MESSAGE = 'That code is invalid or has expired.'
const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'
const VERIFY_MIN_DURATION_MS = 1500

export type VerifyRecoveryCodeResult = { ok: true } | { ok: false; error: string }

/** Step 2. Verifies the code, sets the `__recovery_pending` cookie. Timing-floored — see `verify`. */
export async function verifyRecoveryCode(input: unknown): Promise<VerifyRecoveryCodeResult> {
  return withMinimumDuration(verify(input), VERIFY_MIN_DURATION_MS)
}

/** Failed codes are capped per account — Supabase's per-IP verify limit sees this server's IP, not the student's. */
async function verify(input: unknown): Promise<VerifyRecoveryCodeResult> {
  const parsed = VerifyRecoveryCodeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID_CODE_MESSAGE }
  const { email, code } = parsed.data

  const userId = await findActiveUserIdByEmail(email)
  if (!userId || (await isVerifyLocked(userId))) {
    return { ok: false, error: INVALID_CODE_MESSAGE }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })
  if (error) {
    // 429 = Supabase's per-IP limit, not a wrong code — never count it against the account.
    if (error.status === 429) {
      console.log('[verifyRecoveryCode] verify rate-limited')
      return { ok: false, error: RATE_LIMITED_MESSAGE }
    }
    console.error('[verifyRecoveryCode] verifyOtp failed:', error.message)
    await recordFailedVerify(userId)
    return { ok: false, error: INVALID_CODE_MESSAGE }
  }

  await setRecoveryPendingCookie()
  return { ok: true }
}
