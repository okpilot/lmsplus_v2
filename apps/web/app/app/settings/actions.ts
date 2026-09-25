'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'

const UpdateNameSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
})

export async function updateDisplayName(raw: unknown): Promise<ActionResult> {
  const parsed = UpdateNameSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('users')
    .update({ full_name: parsed.data.fullName })
    .eq('id', user.id)
    .select('id')

  if (error) {
    console.error('[updateDisplayName] Update error:', error.message)
    return { success: false, error: 'Failed to update name' }
  }

  if (!data?.length) {
    console.error('[updateDisplayName] Zero rows updated for user:', user.id)
    return { success: false, error: 'Profile not found' }
  }

  revalidatePath('/app')
  return { success: true }
}
