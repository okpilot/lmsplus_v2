'use server'

import { requireAdmin } from '@/lib/auth/require-admin'
import { UpsertSubtopicSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertSubtopic(input: unknown): Promise<ActionResult> {
  const parsed = UpsertSubtopicSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    // @ts-expect-error TS2345: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_subtopics').update(data).eq('id', id)
    if (error) {
      return { success: false, error: error.message }
    }
  } else {
    // @ts-expect-error TS2769: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_subtopics').insert(data)
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'A subtopic with this code already exists in this topic' }
      }
      return { success: false, error: error.message }
    }
  }

  revalidatePath('/app/admin/syllabus')
  return { success: true }
}
