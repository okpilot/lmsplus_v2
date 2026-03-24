'use server'

import { UpsertQuestionSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

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
  data: Record<string, unknown>,
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

async function insertQuestion(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  userId: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .single<{ organization_id: string }>()

  if (profileErr || !profile?.organization_id) {
    return { success: false, error: 'Could not resolve organization' }
  }

  const { data: bank, error: bankErr } = await supabase
    .from('question_banks')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .limit(1)
    .single<{ id: string }>()

  if (bankErr || !bank) {
    return { success: false, error: 'No question bank found for organization' }
  }

  // @ts-expect-error TS2769: row type resolves to `never` due to TypeScript inference depth limit
  const { error } = await supabase.from('questions').insert({
    ...data,
    organization_id: profile.organization_id,
    bank_id: bank.id,
    created_by: userId,
  })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A question with this number already exists' }
    }
    return { success: false, error: error.message }
  }
  return { success: true }
}
