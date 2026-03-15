'use server'

import { requireAdmin } from '@/lib/auth/require-admin'
import { UpsertSubjectSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertSubject(input: unknown): Promise<ActionResult> {
  const parsed = UpsertSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase } = await requireAdmin()
  const { id, ...data } = parsed.data

  if (id) {
    // @ts-expect-error TS2345: row type resolves to `never` due to TypeScript inference depth limit
    const { error } = await supabase.from('easa_subjects').update(data).eq('id', id)
    if (error) {
      return { success: false, error: error.message }
    }
  } else {
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
