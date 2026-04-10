'use server'

import { ToggleExamConfigSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function toggleExamConfig(input: unknown): Promise<ActionResult> {
  const parsed = ToggleExamConfigSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase, organizationId } = await requireAdmin()
  const { subjectId, enabled } = parsed.data

  // If enabling, verify config + distributions exist
  if (enabled) {
    const { data: config } = await supabase
      .from('exam_configs')
      .select('id, total_questions')
      .eq('organization_id', organizationId)
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!config) {
      return { success: false, error: 'Configure exam parameters before enabling' }
    }

    const { data: distributions } = await supabase
      .from('exam_config_distributions')
      .select('question_count')
      .eq('exam_config_id', config.id)

    const totalDistributed = (distributions ?? []).reduce((sum, d) => sum + d.question_count, 0)

    if (totalDistributed !== config.total_questions) {
      return {
        success: false,
        error: `Distribution total (${totalDistributed}) does not match total questions (${config.total_questions})`,
      }
    }
  }

  const { data, error } = await supabase
    .from('exam_configs')
    .update({
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[toggleExamConfig] Update error:', error.message)
    return { success: false, error: 'Failed to update exam status' }
  }
  if (!data?.length) {
    return { success: false, error: 'Config not found' }
  }

  revalidatePath('/app/admin/exam-config')
  return { success: true }
}
