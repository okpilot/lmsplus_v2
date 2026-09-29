'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { type LoadResult, type QuizQuestionRow, toQuestion } from './load-session-question-row'

const LoadVfrRtExamQuestionsSchema = z.object({ sessionId: z.uuid() })

/** Loads a VFR RT exam session's questions (no explanations) in its frozen question order. */
export async function loadVfrRtExamQuestions(input: unknown): Promise<LoadResult> {
  const parsed = LoadVfrRtExamQuestionsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid session' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[loadVfrRtExamQuestions] Auth error:', authError.message)
    return { success: false, error: 'Not authenticated' }
  }
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await rpc<QuizQuestionRow[]>(supabase, 'get_vfr_rt_exam_questions', {
    p_session_id: parsed.data.sessionId,
  })
  if (error) {
    console.error('[loadVfrRtExamQuestions] RPC error:', error.message)
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }
  if (!data?.length) return { success: false, error: 'No questions found' }

  return { success: true, questions: data.map(toQuestion) }
}
