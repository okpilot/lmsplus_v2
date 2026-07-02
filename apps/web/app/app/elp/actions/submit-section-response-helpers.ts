import type { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export const BUCKET = 'elp-recordings'
const MAX_AUDIO_SIZE = 25 * 1024 * 1024 // 25MB
const ALLOWED_EXT = new Set(['webm', 'mp4', 'm4a', 'mp3', 'wav', 'ogg', 'oga'])

// FormData scalars arrive as strings — z.coerce narrows them to the RPC's numeric params.
export const SubmitSectionInput = z.object({
  sessionId: z.uuid(),
  sectionNo: z.coerce.number().int().min(1).max(5),
  durationMs: z.coerce.number().int().positive().optional(),
})

export type SubmitSectionInputType = z.infer<typeof SubmitSectionInput>

export type SubmitSectionResult =
  | { success: true; responseId: string }
  | { success: false; error: string }

export function parseInput(formData: FormData): SubmitSectionInputType | null {
  try {
    return SubmitSectionInput.parse({
      sessionId: formData.get('sessionId'),
      sectionNo: formData.get('sectionNo'),
      durationMs: formData.get('durationMs') ?? undefined,
    })
  } catch {
    return null
  }
}

export function extractAudioFile(value: FormDataEntryValue | null): File | null {
  if (!(value instanceof File)) return null
  if (value.size === 0 || value.size > MAX_AUDIO_SIZE) return null
  return value
}

export function audioExt(fileName: string): string {
  const ext = (fileName.split('.').pop() ?? '').replaceAll(/[^a-z0-9]/gi, '').toLowerCase()
  return ALLOWED_EXT.has(ext) ? ext : 'webm'
}

export async function resolveOrgId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .single<{ organization_id: string }>()
  if (error) {
    console.error('[submitSectionResponse] org lookup error:', error.message)
    return null
  }
  return profile?.organization_id ?? null
}

/**
 * Uploads the audio to the private bucket, records the response via the RPC, and
 * best-effort cleans up the orphaned object if the RPC fails.
 *
 * 4 params (§3 infrastructure-helper exception): `supabase` is the injected client;
 * `input`/`audioPath`/`file` are distinct domain arguments — same shape as the
 * documented `updateFsrsCard(supabase, …)` precedent.
 */
export async function uploadAndRecord(
  supabase: SupabaseClient,
  input: SubmitSectionInputType,
  audioPath: string,
  file: File,
): Promise<SubmitSectionResult> {
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(audioPath, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploadError) {
    console.error('[submitSectionResponse] Storage error:', uploadError.message)
    return { success: false, error: 'Audio upload failed' }
  }

  const result = await recordResponse(supabase, input, audioPath)
  if (!result.success) {
    // Best-effort: remove the just-uploaded object so a failed RPC does not leave
    // an orphaned recording in storage.
    const { error: rmError } = await supabase.storage.from(BUCKET).remove([audioPath])
    if (rmError) {
      console.error('[submitSectionResponse] orphan cleanup failed:', rmError.message)
    }
  }
  return result
}

export async function recordResponse(
  supabase: SupabaseClient,
  input: SubmitSectionInputType,
  audioPath: string,
): Promise<SubmitSectionResult> {
  const { data, error } = await rpc<string>(supabase, 'submit_oral_section_response', {
    p_session_id: input.sessionId,
    p_section_no: input.sectionNo,
    p_audio_path: audioPath,
    p_duration_ms: input.durationMs ?? null,
  })
  if (error || !data) {
    console.error('[submitSectionResponse] RPC error:', error?.message ?? 'no data returned')
    const msg = error?.message ?? ''
    if (msg.includes('section_already_submitted')) {
      return { success: false, error: 'This section was already submitted.' }
    }
    if (msg.includes('oral_session_not_active')) {
      return { success: false, error: 'This oral exam is no longer active.' }
    }
    if (msg.includes('oral_session_not_found')) {
      return { success: false, error: 'Oral exam session not found.' }
    }
    return { success: false, error: 'Failed to submit section. Please try again.' }
  }
  return { success: true, responseId: data }
}
