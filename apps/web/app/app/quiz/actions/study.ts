'use server'

import { z } from 'zod'
import { getRandomQuestionIds } from '@/lib/queries/quiz-session-queries'
import { getStudyQuestions, type StudyQuestion } from '@/lib/queries/study-queries'

const StartStudySchema = z.object({
  subjectId: z.uuid(),
  topicIds: z.array(z.uuid()).optional(),
  subtopicIds: z.array(z.uuid()).optional(),
  count: z.number().int().min(1).max(500),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).optional(),
  calcMode: z.enum(['all', 'only', 'exclude']).optional(),
  imageMode: z.enum(['all', 'only', 'exclude']).optional(),
})

export type StartStudyResult =
  | { success: true; questions: StudyQuestion[] }
  | { success: false; error: string }

export async function startStudy(raw: unknown): Promise<StartStudyResult> {
  const parsed = StartStudySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[startStudy] Invalid input')
    return { success: false, error: 'Invalid input' }
  }

  try {
    const { subjectId, topicIds, subtopicIds, count, filters, calcMode, imageMode } = parsed.data
    const ids = await getRandomQuestionIds({
      subjectId,
      topicIds,
      subtopicIds,
      count,
      filters,
      calcMode,
      imageMode,
      questionType: 'multiple_choice',
    })

    // An empty study set is a valid state, not an error — skip the fetch RPC entirely.
    if (ids.length === 0) return { success: true, questions: [] }

    const questions = await getStudyQuestions(ids)
    return { success: true, questions }
  } catch (err) {
    console.error('[startStudy] error:', err)
    // get_study_questions raises 'active_exam_session' (mig 135) when the caller has
    // a live exam — Study Mode reveals answer keys, so it is blocked mid-exam. Surface
    // a clear message instead of the generic one (the helper wraps the RPC error, so
    // the token is carried in the message). Other errors stay generic (no DB-detail leak).
    if (err instanceof Error && err.message.includes('active_exam_session')) {
      return { success: false, error: 'Finish or exit your active exam first.' }
    }
    return { success: false, error: 'Failed to start study session' }
  }
}
