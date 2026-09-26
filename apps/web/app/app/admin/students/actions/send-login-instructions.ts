'use server'

import type { createServerSupabaseClient } from '@repo/db/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { rpc } from '@/lib/supabase-rpc'
import { getLoginInstructionsRecipient } from '../login-instructions-recipient'
import { issueAndEmailPassword } from './deliver-login-instructions'

const SendLoginInstructionsSchema = z.object({ id: z.uuid() })

export type SendLoginInstructionsResult =
  | { success: true }
  | {
      success: false
      error:
        | 'Invalid input'
        | 'User not found'
        | 'Failed to send login instructions'
        | 'Password was changed but not marked temporary. Send again.'
        | 'The password was replaced but the email could not be sent. Send again.'
        | 'Login instructions were emailed but the send could not be recorded.'
    }

export async function sendLoginInstructions(input: unknown): Promise<SendLoginInstructionsResult> {
  const parsed = SendLoginInstructionsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase, organizationId } = await requireAdmin()
  const recipient = await getLoginInstructionsRecipient(parsed.data.id, organizationId)
  if (!recipient) return { success: false, error: 'User not found' }

  // Fail fast on a misconfigured base URL rather than emailing a broken link.
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error('[sendLoginInstructions] NEXT_PUBLIC_APP_URL is not set')
    return { success: false, error: 'Failed to send login instructions' }
  }

  const delivered = await issueAndEmailPassword({
    supabase,
    id: parsed.data.id,
    organizationId,
    recipient,
  })
  if (!delivered.ok) return delivered.result

  return recordSend(supabase, parsed.data.id)
}

/** Stamps the send; a failure is surfaced so the admin knows the email already went out. */
async function recordSend(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<SendLoginInstructionsResult> {
  const { error } = await rpc(supabase, 'record_login_instructions_sent', { p_user_id: userId })
  revalidatePath('/app/admin/students')
  if (error) {
    console.error('[sendLoginInstructions] Record-sent RPC failed:', error.message)
    return {
      success: false,
      error: 'Login instructions were emailed but the send could not be recorded.',
    }
  }
  return { success: true }
}
