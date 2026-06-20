'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'

export type RtSubjectData = {
  id: string
  parts: TopicWithSubtopics[]
}

/**
 * Loads the RT subject id and its three practice parts (topics) with question counts.
 * Throws on subject-lookup failure (page-critical); degrades to [] on topic failure.
 */
export async function getRtSubjectData(): Promise<RtSubjectData> {
  const supabase = await createServerSupabaseClient()

  const { data: subject, error } = await supabase
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .is('deleted_at', null)
    .single()

  if (error || !subject) {
    throw new Error(`Failed to load VFR RT subject: ${error?.message ?? 'not found'}`)
  }

  let parts: TopicWithSubtopics[] = []
  try {
    parts = await getTopicsWithSubtopics(subject.id)
  } catch (err) {
    console.error(
      '[getRtSubjectData] Failed to load RT topics:',
      err instanceof Error ? err.message : err,
    )
  }

  return { id: subject.id, parts }
}
