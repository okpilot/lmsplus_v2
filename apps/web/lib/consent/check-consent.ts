import type { SupabaseClient } from '@supabase/supabase-js'
import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '@/lib/consent/versions'
import { rpc } from '@/lib/supabase-rpc'

type ConsentRow = { has_tos: boolean; has_privacy: boolean }

export async function checkConsentStatus(
  supabase: SupabaseClient,
): Promise<'satisfied' | 'required'> {
  // RPC returns TABLE(...) — Supabase JS client delivers this as an array
  const { data, error } = await rpc<ConsentRow[]>(
    supabase as unknown as never,
    'check_consent_status',
    { p_tos_version: CURRENT_TOS_VERSION, p_privacy_version: CURRENT_PRIVACY_VERSION },
  )

  if (error || !data) return 'required'
  const row = Array.isArray(data) ? data[0] : undefined
  if (row?.has_tos && row?.has_privacy) return 'satisfied'
  return 'required'
}

export function buildConsentCookieValue(): string {
  return `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`
}
