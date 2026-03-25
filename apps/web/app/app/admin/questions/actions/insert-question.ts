import type { UpsertQuestionInput } from '@repo/db/schema'
import type { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function insertQuestion(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  userId: string,
  data: Omit<UpsertQuestionInput, 'id'>,
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

  // Intentionally no ON CONFLICT — duplicate question_number should surface to the admin via 23505
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
    console.error('[insertQuestion] Insert error:', error.message)
    return { success: false, error: 'Failed to save question' }
  }
  return { success: true }
}
