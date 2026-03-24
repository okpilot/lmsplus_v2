'use server'

import { BulkUpdateStatusSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

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
    return { success: false, error: error.message }
  }
  if (!data?.length) {
    return { success: false, error: 'No questions were updated' }
  }

  revalidatePath('/app/admin/questions')
  return { success: true }
}
