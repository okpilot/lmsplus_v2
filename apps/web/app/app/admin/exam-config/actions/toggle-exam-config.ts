'use server'

import { ToggleExamConfigSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { examConfigWriteError } from './exam-config-in-use'
import { type AdminClient, checkEnableReadiness } from './exam-config-readiness'

async function applyEnabled(
  supabase: AdminClient,
  target: { organizationId: string; subjectId: string; enabled: boolean },
): Promise<ActionResult> {
  const { organizationId, subjectId, enabled } = target
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
    return {
      success: false,
      error: examConfigWriteError(error.message, 'Failed to update exam status'),
    }
  }
  if (!data?.length) {
    return { success: false, error: 'Config not found' }
  }
  return { success: true }
}

export async function toggleExamConfig(input: unknown): Promise<ActionResult> {
  const parsed = ToggleExamConfigSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase, organizationId } = await requireAdmin()
  const { subjectId, enabled } = parsed.data

  // If enabling, verify config + distributions exist
  if (enabled) {
    const notReady = await checkEnableReadiness(supabase, organizationId, subjectId)
    if (notReady) return notReady
  }

  const result = await applyEnabled(supabase, { organizationId, subjectId, enabled })
  if (!result.success) return result

  revalidatePath('/app/admin/exam-config')
  return { success: true }
}
