'use server'

import { UpsertSubjectSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertSubject(input: unknown): Promise<ActionResult> {
  const parsed = UpsertSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    // Update: sort_order is client-supplied (preserves existing order during code/name edits)
    const { error } = await supabase.from('easa_subjects').update(data).eq('id', id)
    if (error) {
      return { success: false, error: error.message }
    }
  } else {
    // Compute sort_order server-side to avoid stale-prop collisions on rapid adds
    const { data: maxRow } = await supabase
      .from('easa_subjects')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single<{ sort_order: number }>()
    data.sort_order = (maxRow?.sort_order ?? -1) + 1

    // @ts-expect-error TS2769: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_subjects').insert(data)
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A subject with this code already exists' }
      }
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
