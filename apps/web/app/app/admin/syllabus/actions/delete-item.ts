'use server'

import { DeleteSyllabusItemSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function deleteItem(input: unknown): Promise<ActionResult> {
  const parsed = DeleteSyllabusItemSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, table } = parsed.data

  const { error } = await supabase.rpc('soft_delete_syllabus_item', {
    p_table: table,
    p_id: id,
  })

  if (error) {
    if (error.message.includes('in_use')) {
      return { success: false, error: 'Cannot delete: this item is still in use' }
    }
    if (error.message.includes('not_found')) {
      return { success: false, error: 'Item not found' }
    }
    console.error('[deleteItem] Delete failed:', { code: error.code, message: error.message })
    return { success: false, error: 'Could not delete syllabus item' }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
