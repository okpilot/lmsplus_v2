'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { rpc } from '@/lib/supabase-rpc'
import type { StartQuizResult } from '../types'
import { blockedFailure, type WithBlocked } from './_blocked-start'

const StartQuizInput = z.object({
  subjectId: z.uuid(),
  topicIds: z.array(z.uuid()).optional(),
  subtopicIds: z.array(z.uuid()).optional(),
  count: z.number().int().min(1).max(500),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
  calcMode: z.enum(['all', 'only', 'exclude']).default('all'),
  imageMode: z.enum(['all', 'only', 'exclude']).default('all'),
})

type Started = { sessionId: string; questionIds: string[] }

/** Narrows the `start_practice_quiz` payload; 'empty' for a zero-row draw, null when malformed. */
function parseStarted(data: unknown): Started | 'empty' | null {
  if (data === null || typeof data !== 'object') return null
  const { session_id, question_ids } = data as Record<string, unknown>
  if (!Array.isArray(question_ids) || !question_ids.every((id) => typeof id === 'string')) {
    return null
  }
  if (session_id === null && question_ids.length === 0) return 'empty'
  if (typeof session_id !== 'string' || question_ids.length === 0) return null
  return { sessionId: session_id, questionIds: question_ids }
}

export async function startQuizSession(raw: unknown): Promise<WithBlocked<StartQuizResult>> {
  try {
    const supabase = await createServerSupabaseClient()
    if (!(await verifySessionUser(supabase))) return { success: false, error: 'Not authenticated' }

    let input: z.infer<typeof StartQuizInput>
    try {
      input = StartQuizInput.parse(raw)
    } catch {
      console.error('[startQuizSession] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    // One round trip: the RPC draws the ids and starts the session (and decides the stored topic).
    const { data, error } = await rpc<unknown>(supabase, 'start_practice_quiz', {
      p_subject_id: input.subjectId,
      p_topic_ids: input.topicIds ?? null,
      p_subtopic_ids: input.subtopicIds ?? null,
      p_count: input.count,
      p_filters: input.filters,
      p_calc_mode: input.calcMode,
      p_has_image: input.imageMode,
    })

    if (error) {
      console.error('[startQuizSession] RPC error:', error.message)
      const blocked = blockedFailure(error.message)
      if (blocked) return blocked
      return { success: false, error: 'Failed to start session' }
    }

    const started = parseStarted(data)
    if (!started) {
      console.error('[startQuizSession] start_practice_quiz returned a malformed payload')
      return { success: false, error: 'Failed to start session' }
    }
    if (started === 'empty') {
      return { success: false, error: 'No questions available for this selection' }
    }
    return { success: true, ...started }
  } catch (err) {
    console.error('[startQuizSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
