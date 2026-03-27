'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { buildConsentCookieValue } from '@/lib/consent/check-consent'
import {
  CONSENT_COOKIE,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TOS_VERSION,
} from '@/lib/consent/versions'
import { rpc } from '@/lib/supabase-rpc'

const ConsentSchema = z.object({
  acceptedTos: z.literal(true, { message: 'You must accept the Terms of Service' }),
  acceptedPrivacy: z.literal(true, { message: 'You must accept the Privacy Policy' }),
  acceptedAnalytics: z.boolean(),
})

type ActionResult = { success: true } | { success: false; error: string }

export async function recordConsent(raw: unknown): Promise<ActionResult> {
  const parsed = ConsentSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const headerStore = await headers()
  const ipAddress = headerStore.get('x-forwarded-for') ?? null
  const userAgent = headerStore.get('user-agent') ?? null

  const { error: tosError } = await rpc(supabase, 'record_consent', {
    p_document_type: 'terms_of_service',
    p_document_version: CURRENT_TOS_VERSION,
    p_accepted: true,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  })
  if (tosError) {
    console.error('[recordConsent] TOS record error:', tosError.message)
    return { success: false, error: 'Failed to record consent' }
  }

  const { error: privacyError } = await rpc(supabase, 'record_consent', {
    p_document_type: 'privacy_policy',
    p_document_version: CURRENT_PRIVACY_VERSION,
    p_accepted: true,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  })
  if (privacyError) {
    console.error('[recordConsent] Privacy record error:', privacyError.message)
    return { success: false, error: 'Failed to record consent' }
  }

  if (parsed.data.acceptedAnalytics) {
    const { error: analyticsError } = await rpc(supabase, 'record_consent', {
      p_document_type: 'cookie_analytics',
      p_document_version: 'v1.0',
      p_accepted: true,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    })
    if (analyticsError) {
      console.error('[recordConsent] Analytics record error:', analyticsError.message)
      return { success: false, error: 'Failed to record consent' }
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(CONSENT_COOKIE, buildConsentCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  })

  return { success: true }
}
