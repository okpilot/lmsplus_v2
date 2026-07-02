'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import {
  audioExt,
  BUCKET,
  extractAudioFile,
  parseInput,
  recordResponse,
  resolveOrgId,
  type SubmitSectionResult,
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
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (uploadError) {
      console.error('[submitSectionResponse] Storage error:', uploadError.message)
      return { success: false, error: 'Audio upload failed' }
    }

    const result = await recordResponse(supabase, input, path)
    if (!result.success) {
      // Best-effort: remove the just-uploaded object so a failed RPC (e.g. session
      // no longer active) does not leave an orphaned recording in storage.
      const { error: rmError } = await supabase.storage.from(BUCKET).remove([path])
      if (rmError) {
        console.error('[submitSectionResponse] orphan cleanup failed:', rmError.message)
      }
    }
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[submitSectionResponse] Uncaught error:', message)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
