'use server'

import { SoftDeleteQuestionSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function softDeleteQuestion(input: unknown): Promise<ActionResult> {
  const parsed = SoftDeleteQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase, userId } = await requireAdmin()

  const { data, error } = await supabase
    .from('questions')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) {
    console.error('[softDeleteQuestion] DB error:', error.message)
    return { success: false, error: 'Failed to delete question' }
  }
  if (!data?.length) {
    return { success: false, error: 'Question not found or not accessible' }
  }

  revalidatePath('/app/admin/questions')
  return { success: true }
}
