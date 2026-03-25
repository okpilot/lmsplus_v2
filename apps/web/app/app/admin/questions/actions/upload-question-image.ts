'use server'

import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/auth/require-admin'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

type UploadResult = { success: true; url: string } | { success: false; error: string }

export async function uploadQuestionImage(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: 'No file provided' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File too large (max 2MB)' }
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return { success: false, error: 'Invalid file type (PNG, JPEG, or WebP only)' }
  }

  const { supabase, userId } = await requireAdmin()

  // Resolve org for path-based tenant isolation in storage policies
  const { data: profile } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .single<{ organization_id: string }>()

  if (!profile?.organization_id) {
    return { success: false, error: 'Could not resolve organization' }
  }

  const ext =
    (file.name.split('.').pop() ?? 'png').replaceAll(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  const path = `${profile.organization_id}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage.from('question-images').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (error) {
    console.error('[uploadQuestionImage] Storage error:', error.message)
    return { success: false, error: 'Image upload failed' }
  }

  const { data: urlData } = supabase.storage.from('question-images').getPublicUrl(path)

  return { success: true, url: urlData.publicUrl }
}
