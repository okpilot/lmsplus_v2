'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { parseStudyQuestions, type StudyQuestion } from '@/lib/queries/study-queries'
import { rpc } from '@/lib/supabase-rpc'
import { ANOTHER_SESSION_ACTIVE } from './_blocked-start'

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
  | { success: true; questions: StudyQuestion[]; flaggedIds: string[]; sessionId?: string }
  | { success: false; error: string }

const GENERIC_ERROR = 'Failed to start study session'

/** Validates the `start_discovery` payload shape; null when it is malformed. */
function parseStarted(data: unknown): StartStudyResult | null {
  if (data === null || typeof data !== 'object') return null
  const { session_id, questions, flagged_ids } = data as Record<string, unknown>
  const parsed = parseStudyQuestions(questions)
  // Empty draw: the RPC creates no row and returns session_id null.
  if (session_id === null && parsed.length === 0) {
    return { success: true, questions: [], flaggedIds: [] }
  }
  if (typeof session_id !== 'string' || parsed.length === 0) return null
  const flaggedIds = Array.isArray(flagged_ids)
    ? flagged_ids.filter((id): id is string => typeof id === 'string')
    : []
  return { success: true, questions: parsed, flaggedIds, sessionId: session_id }
}

export async function startStudy(raw: unknown): Promise<StartStudyResult> {
  const input = StartStudySchema.safeParse(raw)
  if (!input.success) {
    console.error('[startStudy] Invalid input')
    return { success: false, error: 'Invalid input' }
  }

  try {
    const { subjectId, topicIds, subtopicIds, count, filters, calcMode, imageMode } = input.data
    const supabase = await createServerSupabaseClient()
    // One round trip: draw, discovery session, audit row, answer-key payload and flags.
    // The RPC is atomic, so a failed start leaves no row to tear down.
    const { data, error } = await rpc<unknown>(supabase, 'start_discovery', {
      p_subject_id: subjectId,
      p_topic_ids: topicIds ?? null,
      p_subtopic_ids: subtopicIds ?? null,
      p_count: count,
      p_filters: filters ?? [],
      p_calc_mode: calcMode ?? 'all',
      p_has_image: imageMode ?? 'all',
    })
    if (error) {
      console.error('[startStudy] start_discovery error:', error.message)
      if (error.message.includes(ANOTHER_SESSION_ACTIVE)) {
        return { success: false, error: 'Finish or exit your active session first.' }
      }
      return { success: false, error: GENERIC_ERROR }
    }

    const result = parseStarted(data)
    if (!result) {
      console.error('[startStudy] start_discovery returned a malformed payload')
      return { success: false, error: GENERIC_ERROR }
    }
    return result
  } catch (err) {
    console.error('[startStudy] error:', err)
    return { success: false, error: GENERIC_ERROR }
  }
}
