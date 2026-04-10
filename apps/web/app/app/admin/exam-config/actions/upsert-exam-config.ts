'use server'

import { UpsertExamConfigSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertExamConfig(input: unknown): Promise<ActionResult> {
  const parsed = UpsertExamConfigSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase, organizationId } = await requireAdmin()
  const { subjectId, enabled, totalQuestions, timeLimitSeconds, passMark, distributions } =
    parsed.data

  // Check if config exists
  const { data: existing } = await supabase
    .from('exam_configs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()

  let configId: string

  if (existing) {
    // Update existing config
    configId = existing.id
    const { data: updated, error } = await supabase
      .from('exam_configs')
      .update({
        enabled,
        total_questions: totalQuestions,
        time_limit_seconds: timeLimitSeconds,
        pass_mark: passMark,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId)
      .select('id')

    if (error) {
      console.error('[upsertExamConfig] Update error:', error.message)
      return { success: false, error: 'Failed to update exam configuration' }
    }
    if (!updated?.length) {
      return { success: false, error: 'Config was modified concurrently — please refresh' }
    }
  } else {
    // Insert new config
    const { data, error } = await supabase
      .from('exam_configs')
      .insert({
        organization_id: organizationId,
        subject_id: subjectId,
        enabled,
        total_questions: totalQuestions,
        time_limit_seconds: timeLimitSeconds,
        pass_mark: passMark,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[upsertExamConfig] Insert error:', error?.message)
      return { success: false, error: 'Failed to create exam configuration' }
    }
    configId = data.id
  }

  // Replace distributions: delete all existing, then insert new ones
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

  revalidatePath('/app/admin/exam-config')
  return { success: true }
}
