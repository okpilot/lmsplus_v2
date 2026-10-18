'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import { LINK_INVALID_MESSAGE, SetPasswordLinkSchema } from '@/lib/auth/set-password-link'
import {
  completeLinkPasswordSet,
  type SetPasswordFromLinkResult,
} from './complete-link-password-set'

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

const SetPasswordFromLinkSchema = NewPasswordSchema.and(SetPasswordLinkSchema)
const LINK_INVALID: SetPasswordFromLinkResult = {
  success: false,
  error: LINK_INVALID_MESSAGE,
  linkInvalid: true,
}

const LINK_CHECK_FAILED: SetPasswordFromLinkResult = {
  success: false,
  error: 'We could not check your link. Try again in a moment.',
}

/**
 * Only a 4xx other than 429 proves the token is spent or bad. Rate limits,
 * 5xx and network failures (status 0/undefined) leave it unspent, so a retry works.
 */
function isDefinitiveRejection(error: { status?: number } | null): boolean {
  if (!error) return true
  const status = error.status ?? 0
  return status >= 400 && status < 500 && status !== 429
}

/**
 * Consumes the emailed one-time link and sets the student's first own password.
 * Order: validate (password before token) → `verifyOtp` (consumes the token,
 * opens a recovery session) → live-account check → pin + `updateUser`.
 * The token hash is never logged.
 */
export async function setPasswordFromLink(raw: unknown): Promise<SetPasswordFromLinkResult> {
  const parsed = SetPasswordFromLinkSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    if (issue?.path[0] === 'tokenHash' || issue?.path[0] === 'type') return LINK_INVALID
    return { success: false, error: issue?.message ?? 'Invalid input' }
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.tokenHash,
    type: 'recovery',
  })
  if (error || !data.user) {
    console.error('[setPasswordFromLink] verifyOtp failed:', error?.message ?? 'no user')
    return isDefinitiveRejection(error) ? LINK_INVALID : LINK_CHECK_FAILED
  }

  const gate = await confirmLiveAccount(supabase, data.user.id)
  if (gate) return gate

  return completeLinkPasswordSet(supabase, {
    userId: data.user.id,
    password: parsed.data.password,
  })
}

/**
 * Active-user gate: a valid token for a soft-deleted account must not open a
 * session. Returns a refusal (after a local sign-out), or null when live.
 */
async function confirmLiveAccount(
  supabase: Supabase,
  userId: string,
): Promise<SetPasswordFromLinkResult | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error || !data) {
    if (error) console.error('[setPasswordFromLink] account read failed:', error.message)
    else console.error('[setPasswordFromLink] no live account for user:', userId)
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    if (signOutError) {
      console.error('[setPasswordFromLink] local sign-out failed:', signOutError.message)
    }
    // The token is already spent, so a retry cannot work either way.
    return LINK_INVALID
  }
  return null
}
