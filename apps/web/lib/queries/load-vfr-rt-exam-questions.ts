import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { type LoadResult, toQuestions } from './load-session-question-row'

const LoadVfrRtExamQuestionsSchema = z.object({ sessionId: z.uuid() })

/** Loads a VFR RT exam session's questions (no explanations) in its frozen question order. */
export async function loadVfrRtExamQuestions(input: unknown): Promise<LoadResult> {
  const parsed = LoadVfrRtExamQuestionsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid session' }

  const supabase = await createServerSupabaseClient()
  const user = await verifySessionUser(supabase)
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase.rpc('get_vfr_rt_exam_questions', {
    p_session_id: parsed.data.sessionId,
  })
  if (error) {
    console.error('[loadVfrRtExamQuestions] RPC error:', error.message)
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }
  if (!data?.length) return { success: false, error: 'No questions found' }

  const questions = toQuestions(data, 'loadVfrRtExamQuestions')
  if (!questions) return { success: false, error: 'Failed to load questions. Please try again.' }
  return { success: true, questions }
}
