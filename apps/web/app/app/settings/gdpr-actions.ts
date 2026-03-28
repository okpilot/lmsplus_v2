'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { collectUserData } from '@/lib/gdpr/collect-user-data'
import type { GdprExportPayload } from '@/lib/gdpr/types'

type ExportResult = { success: true; data: GdprExportPayload } | { success: false; error: string }

export async function exportMyData(): Promise<ExportResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  try {
    const data = await collectUserData(supabase, user.id)
    return { success: true, data }
  } catch (err) {
    console.error('[exportMyData] Export failed:', err instanceof Error ? err.message : err)
    return { success: false, error: 'Failed to export data' }
  }
}
