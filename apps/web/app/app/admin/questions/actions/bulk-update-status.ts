'use server'

import { BulkUpdateStatusSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function bulkUpdateStatus(input: unknown): Promise<ActionResult> {
  const parsed = BulkUpdateStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('questions')
    .update({
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    })
    .in('id', parsed.data.ids)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[bulkUpdateStatus] DB error:', error.message)
    return { success: false, error: 'Failed to update question status' }
  }
  if (!data?.length) {
    return { success: false, error: 'No questions were updated' }
  }

  revalidatePath('/app/admin/questions')
  return { success: true }
}
