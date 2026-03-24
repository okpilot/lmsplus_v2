'use server'

import { requireAdmin } from '@/lib/auth/require-admin'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type UploadResult = { success: true; url: string } | { success: false; error: string }

export async function uploadQuestionImage(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: 'No file provided' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File too large (max 2MB)' }
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: 'Invalid file type (PNG, JPEG, or WebP only)' }
  }

  const { supabase } = await requireAdmin()

  const ext =
    (file.name.split('.').pop() ?? 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage.from('question-images').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const { data: urlData } = supabase.storage.from('question-images').getPublicUrl(path)

  return { success: true, url: urlData.publicUrl }
}
