'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { getRandomQuestionIds } from '@/lib/queries/quiz'
import { rpc } from '@/lib/supabase-rpc'
import type { StartQuizResult } from '../types'

const StartQuizInput = z.object({
  subjectId: z.uuid(),
  topicIds: z.array(z.uuid()).optional(),
  subtopicIds: z.array(z.uuid()).optional(),
  count: z.number().int().min(1).max(500),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
})

export async function startQuizSession(raw: unknown): Promise<StartQuizResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: z.infer<typeof StartQuizInput>
    try {
      input = StartQuizInput.parse(raw)
    } catch {
      console.error('[startQuizSession] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const questionIds = await getRandomQuestionIds({
      subjectId: input.subjectId,
      topicIds: input.topicIds,
      subtopicIds: input.subtopicIds,
      count: input.count,
      filters: input.filters,
      userId: user.id,
    })

    if (questionIds.length === 0) {
      return { success: false, error: 'No questions available for this selection' }
    }

    const { data: sessionId, error } = await rpc<string>(supabase, 'start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: input.subjectId,
      p_topic_id: input.topicIds?.length === 1 ? input.topicIds[0] : null,
      p_question_ids: questionIds,
    })

    if (error || !sessionId) {
      console.error('[startQuizSession] RPC error:', error?.message)
      return { success: false, error: 'Failed to start session' }
    }

    return { success: true, sessionId, questionIds }
  } catch (err) {
    console.error('[startQuizSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
