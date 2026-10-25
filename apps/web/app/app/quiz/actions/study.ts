'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { StudyQuestion } from '@/lib/queries/study-queries'
import { rpc } from '@/lib/supabase-rpc'
import { ANOTHER_SESSION_ACTIVE } from './_blocked-start'
import { discardOrphanedSession, parseStarted } from './_study-start'

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

/** One round trip: draw, discovery session, audit row, answer-key payload and flags. */
function callStartDiscovery(input: z.infer<typeof StartStudySchema>) {
  return createServerSupabaseClient().then((supabase) =>
    rpc<unknown>(supabase, 'start_discovery', {
      p_subject_id: input.subjectId,
      p_topic_ids: input.topicIds ?? null,
      p_subtopic_ids: input.subtopicIds ?? null,
      p_count: input.count,
      p_filters: input.filters ?? [],
      p_calc_mode: input.calcMode ?? 'all',
      p_has_image: input.imageMode ?? 'all',
    }),
  )
}

export async function startStudy(raw: unknown): Promise<StartStudyResult> {
  const input = StartStudySchema.safeParse(raw)
  if (!input.success) {
    console.error('[startStudy] Invalid input')
    return { success: false, error: 'Invalid input' }
  }

  try {
    const { data, error } = await callStartDiscovery(input.data)
    if (error) {
      console.error('[startStudy] start_discovery error:', error.message)
      if (error.message === ANOTHER_SESSION_ACTIVE) {
        return { success: false, error: 'Finish or exit your active session first.' }
      }
      return { success: false, error: GENERIC_ERROR }
    }

    const result = parseStarted(data)
    if (!result) {
      console.error('[startStudy] start_discovery returned a malformed payload')
      await discardOrphanedSession(data)
      return { success: false, error: GENERIC_ERROR }
    }
    return result
  } catch (err) {
    console.error('[startStudy] error:', err)
    return { success: false, error: GENERIC_ERROR }
  }
}
