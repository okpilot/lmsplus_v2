import type { ActionResult } from '@/lib/action-result'
import type { requireAdmin } from '@/lib/auth/require-admin'

export type AdminClient = Awaited<ReturnType<typeof requireAdmin>>['supabase']

async function checkDistributionTotal(
  supabase: AdminClient,
  config: { id: string; total_questions: number },
): Promise<ActionResult | null> {
  const { data: distributions, error: distErr } = await supabase
    .from('exam_config_distributions')
    .select('question_count')
    .eq('exam_config_id', config.id)

  if (distErr) {
    console.error('[toggleExamConfig] Distribution read error:', distErr.message)
    return { success: false, error: 'Failed to check question distribution' }
  }

  const totalDistributed = (distributions ?? []).reduce((sum, d) => sum + d.question_count, 0)
  if (totalDistributed !== config.total_questions) {
    return {
      success: false,
      error: `Distribution total (${totalDistributed}) does not match total questions (${config.total_questions})`,
    }
  }
  return null
}

/** Returns a failure result when the config cannot be enabled, null when ready. */
export async function checkEnableReadiness(
  supabase: AdminClient,
  organizationId: string,
  subjectId: string,
): Promise<ActionResult | null> {
  const { data: config, error: configErr } = await supabase
    .from('exam_configs')
    .select('id, total_questions')
    .eq('organization_id', organizationId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()

  if (configErr) {
    console.error('[toggleExamConfig] Config read error:', configErr.message)
    return { success: false, error: 'Failed to check exam configuration' }
  }
  if (!config) {
    return { success: false, error: 'Configure exam parameters before enabling' }
  }
  return checkDistributionTotal(supabase, config)
}
