'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import {
  claimRecoverySlot,
  findActiveUserIdByEmail,
  issueRecoveryCode,
} from '@/lib/auth/recovery-code'
import { isEmailConfigured, sendEmail } from '@/lib/email/resend'
import { recoveryCodeEmail } from '@/lib/email/templates/recovery-code'

// Auth and users.email store addresses lowercased; normalise so a capitalised entry still matches.
const EmailSchema = z.string().trim().toLowerCase().email()

const RequestRecoveryCodeSchema = z.object({ email: EmailSchema })

export type RequestRecoveryCodeResult = { ok: true } | { ok: false; error: 'Invalid email' }

/**
 * Step 1 of the forgot-password flow. Always resolves to a neutral `{ ok:
 * true }` once the input itself is valid — whether or not the account
 * exists, the send is throttled, email sending is unconfigured, or the send
 * itself fails — so the response never reveals whether an account exists.
 */
export async function requestRecoveryCode(input: unknown): Promise<RequestRecoveryCodeResult> {
  const parsed = RequestRecoveryCodeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid email' }
  const { email } = parsed.data

  const userId = await findActiveUserIdByEmail(email)
  if (!userId) return { ok: true }

  if (!isEmailConfigured()) {
    console.error('[requestRecoveryCode] email sending is not configured')
    return { ok: true }
  }

  const { allowed } = await claimRecoverySlot(userId)
  if (!allowed) return { ok: true }

  const code = await issueRecoveryCode(email)
  if (!code) return { ok: true }

  const sent = await sendEmail({ to: email, ...recoveryCodeEmail({ code }) })
  if (!sent.ok) {
    console.error('[requestRecoveryCode] send failed:', sent.error)
  }
  return { ok: true }
}

const VerifyRecoveryCodeSchema = z.object({
  email: EmailSchema,
  code: z.string().regex(/^\d{6,10}$/),
})

const INVALID_CODE_MESSAGE = 'That code is invalid or has expired.'

export type VerifyRecoveryCodeResult = { ok: true } | { ok: false; error: string }

/**
 * Step 2 of the forgot-password flow. Verifies the emailed code against
 * Supabase Auth and, on success, sets the `__recovery_pending` cookie the
 * proxy uses to lock the resulting session to `/auth/reset-password`.
 */
export async function verifyRecoveryCode(input: unknown): Promise<VerifyRecoveryCodeResult> {
  const parsed = VerifyRecoveryCodeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID_CODE_MESSAGE }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: 'recovery',
  })
  if (error) {
    console.error('[verifyRecoveryCode] verifyOtp failed:', error.message)
    return { ok: false, error: INVALID_CODE_MESSAGE }
  }

  await setRecoveryPendingCookie()
  return { ok: true }
}

/** Locks the resulting session to `/auth/reset-password` only (the proxy enforces it). */
async function setRecoveryPendingCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set('__recovery_pending', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
}
