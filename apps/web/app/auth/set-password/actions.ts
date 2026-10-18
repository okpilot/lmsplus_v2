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
const GENERIC_ERROR = 'Unable to update password. Please try again.'
const LINK_INVALID: SetPasswordFromLinkResult = {
  success: false,
  error: LINK_INVALID_MESSAGE,
  linkInvalid: true,
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
    return LINK_INVALID
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
    await supabase.auth.signOut({ scope: 'local' })
    return error ? { success: false, error: GENERIC_ERROR } : LINK_INVALID
  }
  return null
}
