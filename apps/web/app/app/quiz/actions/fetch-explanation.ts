'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const Input = z.object({ questionId: z.string().uuid() })

export type FetchExplanationResult =
  | {
      success: true
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false }

export async function fetchExplanation(raw: unknown): Promise<FetchExplanationResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { questionId } = Input.parse(raw)

  // Only fetch explanation fields — no correct answer exposure
  const { data, error } = await supabase
    .from('questions')
    .select('explanation_text, explanation_image_url')
    .eq('id', questionId)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false }
  return {
    success: true,
    explanationText: (data as { explanation_text: string | null }).explanation_text,
    explanationImageUrl: (data as { explanation_image_url: string | null }).explanation_image_url,
  }
}
