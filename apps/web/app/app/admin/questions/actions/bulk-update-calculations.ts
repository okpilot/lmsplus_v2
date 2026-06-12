'use server'

import { BulkUpdateCalculationsSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function bulkUpdateCalculations(input: unknown): Promise<ActionResult> {
  const parsed = BulkUpdateCalculationsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('questions')
    .update({
      has_calculations: parsed.data.has_calculations,
      updated_at: new Date().toISOString(),
    })
    .in('id', parsed.data.ids)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[bulkUpdateCalculations] DB error:', error.message)
    return { success: false, error: 'Failed to update calculation tags' }
  }
  if (!data?.length) {
    return { success: false, error: 'No questions were updated' }
  }

  revalidatePath('/app/admin/questions')
  return { success: true }
}
