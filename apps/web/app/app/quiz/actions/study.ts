'use server'

import { z } from 'zod'
import { getRandomQuestionIds } from '@/lib/queries/quiz-session-queries'
import { getStudyQuestions, type StudyQuestion } from '@/lib/queries/study-queries'
import { createDiscoverySession } from './_start-discovery-session'
import { endDiscovery } from './end-discovery'

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

  let createdSessionId: string | null = null
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

    // An empty study set is a valid state, not an error — skip both the session
    // creation and the fetch (no row is created for an empty discovery set).
    if (ids.length === 0) return { success: true, questions: [] }

    // Create the real ephemeral discovery session row (enforces the single-active
    // guard). Capture the created id so teardown is scoped to THIS request's row —
    // a blanket student+mode teardown could tombstone a concurrent retry's newer row.
    const { id: createdId, error: startError } = await createDiscoverySession(subjectId, ids)
    if (startError) return { success: false, error: startError }
    createdSessionId = createdId

    const questions = await getStudyQuestions(ids)
    return { success: true, questions }
  } catch (err) {
    console.error('[startStudy] error:', err)
    // If the row was created but the key fetch failed, best-effort tear it down,
    // scoped to the id THIS request created, so we don't strand an orphan active row.
    if (createdSessionId) await endDiscovery({ sessionId: createdSessionId }).catch(() => {})
    // get_study_questions raises 'active_exam_session' (mig 135) when the caller has
    // a live exam — surface a clear message instead of the generic one (the helper
    // wraps the RPC error, so the token is carried in the message).
    if (err instanceof Error && err.message.includes('active_exam_session')) {
      return { success: false, error: 'Finish or exit your active exam first.' }
    }
    return { success: false, error: 'Failed to start study session' }
  }
}
