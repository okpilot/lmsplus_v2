'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const Input = z.object({ questionId: z.string().uuid(), sessionId: z.string().uuid() })

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

  const { questionId, sessionId } = Input.parse(raw)

  // Verify session belongs to this user, is active, and contains the question
  const { data: session, error: sessionError } = await supabase
    .from('quiz_sessions')
    .select('config')
    .eq('id' as string & keyof never, sessionId)
    .eq('student_id' as string & keyof never, user.id)
    .is('ended_at' as string & keyof never, null)
    .is('deleted_at' as string & keyof never, null)
    .single()
  if (sessionError || !session) return { success: false }
  const config = (session as unknown as { config: { question_ids: unknown } }).config
  const qIds = config?.question_ids
  if (!Array.isArray(qIds) || !qIds.includes(questionId)) return { success: false }

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
