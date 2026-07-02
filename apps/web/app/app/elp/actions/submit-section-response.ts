'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import {
  audioExt,
  extractAudioFile,
  parseInput,
  resolveOrgId,
  type SubmitSectionResult,
  uploadAndRecord,
} from './submit-section-response-helpers'

export type { SubmitSectionResult }

export async function submitSectionResponse(formData: FormData): Promise<SubmitSectionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const file = extractAudioFile(formData.get('audio'))
    if (!file) return { success: false, error: 'Invalid or missing audio file' }

    const input = parseInput(formData)
    if (!input) return { success: false, error: 'Invalid input' }

    const orgId = await resolveOrgId(supabase, user.id)
    if (!orgId) return { success: false, error: 'Could not resolve organization' }

    const path = `${orgId}/${user.id}/${input.sessionId}/${input.sectionNo}.${audioExt(file.name)}`
    return await uploadAndRecord(supabase, input, path, file)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[submitSectionResponse] Uncaught error:', message)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
