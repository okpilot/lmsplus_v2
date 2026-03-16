'use server'

import { DeleteSyllabusItemSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function deleteItem(input: unknown): Promise<ActionResult> {
  const parsed = DeleteSyllabusItemSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, table } = parsed.data

  const { error } = await supabase.from(table).delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return {
        success: false,
        error: 'Cannot delete: questions reference this item',
      }
    }
    console.error('[deleteItem] Delete failed:', { code: error.code, message: error.message })
    return { success: false, error: 'Could not delete syllabus item' }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
