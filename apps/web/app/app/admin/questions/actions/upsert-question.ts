'use server'

import type { UpsertQuestionInput } from '@repo/db/schema'
import { UpsertQuestionSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { insertQuestion } from './insert-question'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertQuestion(input: unknown): Promise<ActionResult> {
  const parsed = UpsertQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { supabase, userId } = await requireAdmin()
  const { id, ...data } = parsed.data

  const result = id
    ? await updateQuestion(supabase, id, data)
    : await insertQuestion(supabase, userId, data)

  if (result.success) revalidatePath('/app/admin/questions')
  return result
}

async function updateQuestion(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  id: string,
  data: Omit<UpsertQuestionInput, 'id'>,
): Promise<ActionResult> {
  const { data: current, error: fetchErr } = await supabase
    .from('questions')
    .select('version')
    .eq('id', id)
    .single<{ version: number }>()

  if (fetchErr) {
    return { success: false, error: 'Question not found' }
  }

  const { data: updated, error } = await supabase
    .from('questions')
    .update({
      ...data,
      version: (current?.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A question with this number already exists' }
    }
    return { success: false, error: error.message }
  }
  if (!updated?.length) {
    return { success: false, error: 'Question not found or not accessible' }
  }
  return { success: true }
}
