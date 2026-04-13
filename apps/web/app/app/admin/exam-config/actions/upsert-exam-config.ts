'use server'

import { UpsertExamConfigSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { rpc } from '@/lib/supabase-rpc'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertExamConfig(input: unknown): Promise<ActionResult> {
  const parsed = UpsertExamConfigSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { subjectId, enabled, totalQuestions, timeLimitSeconds, passMark, distributions } =
    parsed.data

  const { data, error } = await rpc<string>(supabase, 'upsert_exam_config', {
    p_subject_id: subjectId,
    p_enabled: enabled,
    p_total_questions: totalQuestions,
    p_time_limit_seconds: timeLimitSeconds,
    p_pass_mark: passMark,
    p_distributions: distributions.map((d) => ({
      topic_id: d.topicId,
      subtopic_id: d.subtopicId ?? null,
      question_count: d.questionCount,
    })),
  })

  if (error) {
    console.error('[upsertExamConfig] RPC error:', error.message)
    return { success: false, error: 'Failed to save exam configuration' }
  }
  if (!data) {
    console.error('[upsertExamConfig] RPC returned no config_id')
    return { success: false, error: 'Failed to save exam configuration' }
  }

  revalidatePath('/app/admin/exam-config')
  return { success: true }
}
