'use server'

import { UpsertTopicSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { checkLiveParent, updateLiveRow, writeFailure } from './check-live-parent'

const WRITE_CTX = {
  fn: 'upsertTopic',
  entity: 'topic',
  duplicate: 'A topic with this code already exists in this subject (it may have been deleted)',
} as const

export async function upsertTopic(input: unknown): Promise<ActionResult> {
  const parsed = UpsertTopicSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    const failure = await updateLiveRow(supabase, { table: 'easa_topics', id, data }, WRITE_CTX)
    if (failure) return failure
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
      return writeFailure({ ...WRITE_CTX, op: 'insert' }, error.message, error.code)
    }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
