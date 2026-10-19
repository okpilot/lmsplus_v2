import type { UpsertQuestionInput } from '@repo/db/schema'
import type { ActionResult } from '@/lib/action-result'
import type { requireAdmin } from '@/lib/auth/require-admin'

export async function insertQuestion(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  { userId, organizationId }: { userId: string; organizationId: string },
  data: Omit<UpsertQuestionInput, 'id'>,
): Promise<ActionResult> {
  const { data: bank, error: bankErr } = await supabase
    .from('question_banks')
    .select('id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()

  if (bankErr) {
    console.error('[insertQuestion] Bank lookup error:', bankErr.message)
    return { success: false, error: 'Failed to save question' }
  }
  if (!bank) {
    console.error('[insertQuestion] No question bank for organization:', organizationId)
    return { success: false, error: 'No question bank found for organization' }
  }

  // Intentionally no ON CONFLICT — duplicate question_number should surface to the admin via 23505
  const { error } = await supabase.from('questions').insert({
    ...data,
    organization_id: organizationId,
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
