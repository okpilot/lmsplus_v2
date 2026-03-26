'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const UpdateNameSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
})

type UpdateNameResult = { success: true } | { success: false; error: string }

export async function updateDisplayName(raw: unknown): Promise<UpdateNameResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  let parsed: z.infer<typeof UpdateNameSchema>
  try {
    parsed = UpdateNameSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

  const { data, error } = await supabase
    .from('users')
    .update({ full_name: parsed.fullName })
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
