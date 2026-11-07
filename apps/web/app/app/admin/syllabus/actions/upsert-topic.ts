'use server'

import { UpsertTopicSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { checkLiveParent, writeFailure } from './check-live-parent'

export async function upsertTopic(input: unknown): Promise<ActionResult> {
  const parsed = UpsertTopicSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    const { data: updated, error } = await supabase
      .from('easa_topics')
      .update(data)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      return writeFailure({ fn: 'upsertTopic', op: 'update', entity: 'topic' }, error.message)
    }
    if (!updated || updated.length === 0) {
      return { success: false, error: 'Item not found' }
    }
  } else {
    const parentFailure = await checkLiveParent(supabase, {
      table: 'easa_subjects',
      id: data.subject_id,
      label: 'topic',
    })
    if (parentFailure) return parentFailure

    // Compute sort_order server-side to avoid stale-prop collisions on rapid adds
    const { data: maxRow, error: maxRowError } = await supabase
      .from('easa_topics')
      .select('sort_order')
      .eq('subject_id', data.subject_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single<{ sort_order: number }>()
    // PGRST116 (no rows) is the expected first-insert case — only a real error is a failure.
    if (maxRowError && maxRowError.code !== 'PGRST116') {
      console.error('[upsertTopic] sort_order lookup error:', maxRowError.message)
      return { success: false, error: 'Failed to create topic' }
    }
    data.sort_order = (maxRow?.sort_order ?? -1) + 1

    // @ts-expect-error TS2769: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_topics').insert(data)
    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: 'A topic with this code already exists in this subject (it may have been deleted)',
        }
      }
      return writeFailure({ fn: 'upsertTopic', op: 'insert', entity: 'topic' }, error.message)
    }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
