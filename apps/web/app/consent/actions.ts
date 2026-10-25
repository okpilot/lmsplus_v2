'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { setConsentCookie } from '@/lib/consent/consent-cookie'
import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '@/lib/consent/versions'

const ConsentSchema = z.object({
  acceptedTos: z.literal(true, { message: 'You must accept the Terms of Service' }),
  acceptedPrivacy: z.literal(true, { message: 'You must accept the Privacy Policy' }),
})

export async function recordConsent(raw: unknown): Promise<ActionResult> {
  const parsed = ConsentSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const user = await verifySessionUser(supabase)
  if (!user) return { success: false, error: 'Not authenticated' }

  const headerStore = await headers()
  const ipAddress = headerStore.get('x-forwarded-for') ?? undefined
  const userAgent = headerStore.get('user-agent') ?? undefined

  const base = { p_accepted: true, p_ip_address: ipAddress, p_user_agent: userAgent }
  const [{ error: tosError }, { error: privacyError }] = await Promise.all([
    supabase.rpc('record_consent', {
      ...base,
      p_document_type: 'terms_of_service',
      p_document_version: CURRENT_TOS_VERSION,
    }),
    supabase.rpc('record_consent', {
      ...base,
      p_document_type: 'privacy_policy',
      p_document_version: CURRENT_PRIVACY_VERSION,
    }),
  ])
  if (tosError) console.error('[recordConsent] TOS record error:', tosError.message)
  if (privacyError) console.error('[recordConsent] Privacy record error:', privacyError.message)
  if (tosError || privacyError) return { success: false, error: 'Failed to record consent' }

  const cookieStore = await cookies()
  setConsentCookie(cookieStore, user.id)

  return { success: true }
}
