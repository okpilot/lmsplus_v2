'use server'

import { adminClient } from '@repo/db/admin'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { collectUserData } from '@/lib/gdpr/collect-user-data'
import type { GdprExportPayload } from '@/lib/gdpr/types'

const ExportStudentSchema = z.object({
  userId: z.string().uuid(),
})

type ExportResult = { success: true; data: GdprExportPayload } | { success: false; error: string }

export async function exportStudentData(input: unknown): Promise<ExportResult> {
  const parsed = ExportStudentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { organizationId } = await requireAdmin()

  // Verify target belongs to the same org
  const { data: target, error: fetchErr } = await adminClient
    .from('users')
    .select('id')
    .eq('id', parsed.data.userId)
    .eq('organization_id', organizationId)
    .single<{ id: string }>()

  if (fetchErr || !target) {
    if (fetchErr?.code === 'PGRST116') return { success: false, error: 'Student not found' }
    console.error('[exportStudentData] Fetch error:', fetchErr?.message)
    return { success: false, error: 'Student not found' }
  }

  try {
    const data = await collectUserData(adminClient, parsed.data.userId)
    return { success: true, data }
  } catch (err) {
    console.error('[exportStudentData] Export failed:', err instanceof Error ? err.message : err)
    return { success: false, error: 'Failed to export student data' }
  }
}
