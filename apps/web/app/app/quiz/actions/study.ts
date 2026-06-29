'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { getRandomQuestionIds } from '@/lib/queries/quiz-session-queries'
import { getStudyQuestions, type StudyQuestion } from '@/lib/queries/study-queries'
import { rpc } from '@/lib/supabase-rpc'
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

// Maps start_discovery_session RPC error tokens to sanitized domain messages.
// another_session_active is the single-active-session guard (PR A); the validation
// tokens (no_questions_provided / too_many_questions / invalid_question_ids /
// user_not_found_or_inactive / not_authenticated) stay generic — never leak the raw token.
function mapDiscoveryStartError(message: string): string {
  if (message.includes('another_session_active')) {
    return 'Finish or exit your active session first.'
  }
  return 'Failed to start study session'
}

export async function startStudy(raw: unknown): Promise<StartStudyResult> {
  const parsed = StartStudySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[startStudy] Invalid input')
    return { success: false, error: 'Invalid input' }
  }

  let discoveryCreated = false
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

    // Create the real ephemeral discovery session row, which enforces the
    // single-active-session guard (raises another_session_active if a different
    // session is live). Teardown is keyed by student+mode, so the id is not needed.
    const supabase = await createServerSupabaseClient()
    const { error: startError } = await rpc<string>(supabase, 'start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: ids,
    })
    if (startError) {
      console.error('[startStudy] start_discovery_session error:', startError.message)
      return { success: false, error: mapDiscoveryStartError(startError.message) }
    }
    discoveryCreated = true

    const questions = await getStudyQuestions(ids)
    return { success: true, questions }
  } catch (err) {
    console.error('[startStudy] error:', err)
    // If the row was created but the key fetch failed, best-effort tear it down so
    // we don't strand an orphan active discovery row that blocks every other mode.
    if (discoveryCreated) await endDiscovery().catch(() => {})
    // get_study_questions raises 'active_exam_session' (mig 135) when the caller has
    // a live exam — surface a clear message instead of the generic one (the helper
    // wraps the RPC error, so the token is carried in the message).
    if (err instanceof Error && err.message.includes('active_exam_session')) {
      return { success: false, error: 'Finish or exit your active exam first.' }
    }
    return { success: false, error: 'Failed to start study session' }
  }
}
