import type { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function replaceDistributions(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  configId: string,
  distributions: { topicId: string; subtopicId?: string | null; questionCount: number }[],
): Promise<ActionResult> {
  const { error: deleteError } = await supabase
    .from('exam_config_distributions')
    .delete()
    .eq('exam_config_id', configId)

  if (deleteError) {
    console.error('[upsertExamConfig] Delete distributions error:', deleteError.message)
    return { success: false, error: 'Failed to update question distribution' }
  }

  if (distributions.length > 0) {
    const rows = distributions.map((d) => ({
      exam_config_id: configId,
      topic_id: d.topicId,
      subtopic_id: d.subtopicId ?? null,
      question_count: d.questionCount,
    }))
    const { error: insertError } = await supabase.from('exam_config_distributions').insert(rows)
    if (insertError) {
      console.error('[upsertExamConfig] Insert distributions error:', insertError.message)
      return { success: false, error: 'Failed to save question distribution' }
    }
  }

  return { success: true }
}
