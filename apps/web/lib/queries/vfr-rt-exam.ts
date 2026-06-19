import { createServerSupabaseClient } from '@repo/db/server'

export type VfrRtSubject = { id: string; name: string }

export async function getVfrRtSubject(): Promise<VfrRtSubject | null> {
  const supabase = await createServerSupabaseClient()

  // No auth gate here: this lookup uses no user identity (easa_subjects has
  // UNIQUE(code), no org_id, no deleted_at), and the page's requireAuthUser()
  // already guarantees the caller is authenticated.
  const { data, error } = await supabase
    .from('easa_subjects')
    .select('id, name')
    .eq('code', 'RT')
    .maybeSingle<VfrRtSubject>()

  if (error) {
    console.error('[getVfrRtSubject] Query error:', error.message)
    return null
  }

  return data ?? null
}

export async function getActiveVfrRtSession(): Promise<{ sessionId: string } | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getActiveVfrRtSession] Auth error:', authError.message)
    return null
  }
  if (!user) return null

  // Explicit student_id scope required — quiz_sessions has multiple permissive RLS SELECT policies
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('student_id', user.id)
    .eq('mode', 'vfr_rt_exam')
    .is('ended_at', null)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error('[getActiveVfrRtSession] Query error:', error.message)
    return null
  }

  return data ? { sessionId: data.id } : null
}
