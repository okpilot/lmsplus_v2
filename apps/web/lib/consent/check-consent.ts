import type { createServerSupabaseClient } from '@repo/db/server'
import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '@/lib/consent/versions'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function checkConsentStatus(
  supabase: ServerSupabaseClient,
): Promise<'satisfied' | 'required'> {
  // RPC returns TABLE(...) — Supabase JS client delivers this as an array
  const { data, error } = await supabase.rpc('check_consent_status', {
    p_tos_version: CURRENT_TOS_VERSION,
    p_privacy_version: CURRENT_PRIVACY_VERSION,
  })

  if (error || !data) return 'required'
  const row = Array.isArray(data) ? data[0] : undefined
  if (row?.has_tos && row?.has_privacy) return 'satisfied'
  return 'required'
}

/** Cookie value bound to a specific user — a value built for one user id never matches for another. */
export function buildConsentCookieValue(userId: string): string {
  return `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}:${userId}`
}
