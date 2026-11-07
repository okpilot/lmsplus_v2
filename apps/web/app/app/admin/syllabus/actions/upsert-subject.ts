'use server'

import { UpsertSubjectSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function upsertSubject(input: unknown): Promise<ActionResult> {
  const parsed = UpsertSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    // Update: sort_order is client-supplied (preserves existing order during code/name edits)
    const { data: updated, error } = await supabase
      .from('easa_subjects')
      .update(data)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      if (error.message.includes('item_deleted')) {
        return { success: false, error: 'Item not found' }
      }
      console.error('[upsertSubject] update error:', error.message)
      return { success: false, error: 'Failed to update subject' }
    }
    if (!updated || updated.length === 0) {
      return { success: false, error: 'Item not found' }
    }
  } else {
    // Compute sort_order server-side to avoid stale-prop collisions on rapid adds
    const { data: maxRow, error: maxRowError } = await supabase
      .from('easa_subjects')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single<{ sort_order: number }>()
    // PGRST116 (no rows) is the expected first-insert case — only a real error is a failure.
    if (maxRowError && maxRowError.code !== 'PGRST116') {
      console.error('[upsertSubject] sort_order lookup error:', maxRowError.message)
      return { success: false, error: 'Failed to create subject' }
    }
    data.sort_order = (maxRow?.sort_order ?? -1) + 1

    // @ts-expect-error TS2769: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_subjects').insert(data)
    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'A subject with this code already exists (it may have been deleted)',
        }
      }
      console.error('[upsertSubject] insert error:', error.message)
      return { success: false, error: 'Failed to create subject' }
    }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
