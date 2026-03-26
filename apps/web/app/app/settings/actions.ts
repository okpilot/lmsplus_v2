'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const UpdateNameSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type ActionResult = { success: true } | { success: false; error: string }

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

export async function changePassword(raw: unknown): Promise<ActionResult> {
  const parsed = ChangePasswordSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const email = user.email
  if (!email) return { success: false, error: 'No email associated with account' }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  })
  if (signInError) {
    console.error('[changePassword] Current password verification failed:', signInError.message)
    return { success: false, error: 'Current password is incorrect' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    console.error('[changePassword] Auth update error:', error.message)
    if (error.message?.includes('session')) {
      return { success: false, error: 'Session expired. Please sign in again.' }
    }
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  return { success: true }
}
