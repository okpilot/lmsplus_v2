'use server'

import { UpsertExamConfigSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { replaceDistributions } from './replace-distributions'

type ActionResult = { success: true } | { success: false; error: string }

export async function upsertExamConfig(input: unknown): Promise<ActionResult> {
  const parsed = UpsertExamConfigSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase, organizationId } = await requireAdmin()
  const { subjectId, enabled, totalQuestions, timeLimitSeconds, passMark, distributions } =
    parsed.data

  // Check if config exists
  const { data: existing, error: lookupErr } = await supabase
    .from('exam_configs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupErr) {
    console.error('[upsertExamConfig] Lookup error:', lookupErr.message)
    return { success: false, error: 'Failed to check existing configuration' }
  }

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

  const distResult = await replaceDistributions(supabase, configId, distributions)
  if (!distResult.success) return distResult

  revalidatePath('/app/admin/exam-config')
  return { success: true }
}
