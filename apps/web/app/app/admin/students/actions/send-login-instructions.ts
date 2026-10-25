'use server'

import type { createServerSupabaseClient } from '@repo/db/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isEmailConfigured } from '@/lib/email/resend'
import { getLoginInstructionsRecipient } from '../login-instructions-recipient'
import { issueAndEmailSetPasswordLink } from './deliver-login-instructions'

const SendLoginInstructionsSchema = z.object({ id: z.uuid() })

export type SendLoginInstructionsResult =
  | { success: true }
  | {
      success: false
      error:
        | 'Invalid input'
        | 'User not found'
        | 'Failed to send login instructions'
        | 'The email could not be sent. Send again.'
        | 'Login instructions were emailed but the send could not be recorded.'
    }

export async function sendLoginInstructions(input: unknown): Promise<SendLoginInstructionsResult> {
  const parsed = SendLoginInstructionsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase, organizationId } = await requireAdmin()
  const recipient = await getLoginInstructionsRecipient(parsed.data.id, organizationId)
  if (!recipient) return { success: false, error: 'User not found' }

  if (!hasValidAppUrl()) return { success: false, error: 'Failed to send login instructions' }
  // Checked before a token is issued: issuing voids the student's earlier link or code.
  if (!isEmailConfigured()) {
    console.error('[sendLoginInstructions] email sending is not configured')
    return { success: false, error: 'Failed to send login instructions' }
  }

  const delivered = await issueAndEmailSetPasswordLink({
    supabase,
    userId: parsed.data.id,
    recipient,
  })
  const result = delivered.ok ? await recordSend(supabase, parsed.data.id) : delivered.result
  // A failed delivery may already have voided the earlier link, so refresh either way.
  revalidatePath('/app/admin/students')
  return result
}

/** Fail fast on a misconfigured base URL rather than emailing a broken link. */
function hasValidAppUrl(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('[sendLoginInstructions] NEXT_PUBLIC_APP_URL is not set')
    return false
  }
  if (!URL.canParse(appUrl) || !['http:', 'https:'].includes(new URL(appUrl).protocol)) {
    console.error('[sendLoginInstructions] NEXT_PUBLIC_APP_URL is not a valid URL')
    return false
  }
  return true
}

/** Stamps the send; a failure is surfaced so the admin knows the email already went out. */
async function recordSend(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<SendLoginInstructionsResult> {
  const { error } = await supabase.rpc('record_login_instructions_sent', { p_user_id: userId })
  if (error) {
    console.error('[sendLoginInstructions] Record-sent RPC failed:', error.message)
    return {
      success: false,
      error: 'Login instructions were emailed but the send could not be recorded.',
    }
  }
  return { success: true }
}
