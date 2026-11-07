'use server'

import { UpsertSubtopicSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { checkLiveParent, writeFailure } from './check-live-parent'

export async function upsertSubtopic(input: unknown): Promise<ActionResult> {
  const parsed = UpsertSubtopicSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    const { data: updated, error } = await supabase
      .from('easa_subtopics')
      .update(data)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      return writeFailure({ fn: 'upsertSubtopic', op: 'update', entity: 'subtopic' }, error.message)
    }
    if (!updated || updated.length === 0) {
      return { success: false, error: 'Item not found' }
    }
  } else {
    const parentFailure = await checkLiveParent(supabase, {
      table: 'easa_topics',
      id: data.topic_id,
      label: 'subtopic',
    })
    if (parentFailure) return parentFailure

    // Compute sort_order server-side to avoid stale-prop collisions on rapid adds
    const { data: maxRow, error: maxRowError } = await supabase
      .from('easa_subtopics')
      .select('sort_order')
      .eq('topic_id', data.topic_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single<{ sort_order: number }>()
    // PGRST116 (no rows) is the expected first-insert case — only a real error is a failure.
    if (maxRowError && maxRowError.code !== 'PGRST116') {
      console.error('[upsertSubtopic] sort_order lookup error:', maxRowError.message)
      return { success: false, error: 'Failed to create subtopic' }
    }
    data.sort_order = (maxRow?.sort_order ?? -1) + 1

    // @ts-expect-error TS2769: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_subtopics').insert(data)
    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error:
            'A subtopic with this code already exists in this topic (it may have been deleted)',
        }
      }
      return writeFailure({ fn: 'upsertSubtopic', op: 'insert', entity: 'subtopic' }, error.message)
    }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
