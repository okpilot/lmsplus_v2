'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { getExamEnabledSubjects } from '@/lib/queries/exam-subjects'
import type { SubjectOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'

export type RtSubjectData = {
  id: string
  // Synthetic single-subject option for the reused quiz config machinery. Its `id`
  // equals the RT subject uuid — the session handoff derives subjectName/subjectCode
  // from it. Built here (data layer) so the RSC stays pure composition.
  subjects: SubjectOption[]
  topics: TopicWithSubtopics[]
  // The student's org has an enabled exam_config for RT (getExamEnabledSubjects; error → false).
  examAvailable: boolean
}

/**
 * Loads the RT subject id and its topics/subtopics server-side, so the RSC
 * (VfrRtSetup) can seed the reused quiz topic-tree hook with initial state
 * instead of a client mount-time fetch. Throws on subject-lookup failure
 * (page-critical); degrades to an empty topics list on a topics-fetch
 * failure (non-critical — the form just renders with zero topics).
 */
export async function getRtSubjectData(): Promise<RtSubjectData> {
  const supabase = await createServerSupabaseClient()

  // easa_subjects has no deleted_at column (defined in mig 001, no soft-delete) — read-scope is enforced by RLS.
  const { data: subject, error } = await supabase
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()

  if (error || !subject) {
    // Log the raw DB error server-side; throw a generic message (code-style §5 —
    // never embed Postgres error strings, which can leak schema/connection detail).
    console.error('[getRtSubjectData] Subject lookup failed:', error?.message ?? 'not found')
    throw new Error('Failed to load VFR RT subject')
  }

  let topics: TopicWithSubtopics[] = []
  const [topicsResult, examSubjects] = await Promise.all([
    getTopicsWithSubtopics(subject.id).then(
      (t) => ({ ok: true as const, topics: t }),
      (e: unknown) => ({ ok: false as const, error: e }),
    ),
    getExamEnabledSubjects(),
  ])
  if (topicsResult.ok) {
    topics = topicsResult.topics
  } else {
    console.error(
      '[getRtSubjectData] Topics fetch failed:',
      topicsResult.error instanceof Error ? topicsResult.error.message : topicsResult.error,
    )
  }
  const examAvailable = examSubjects.some((s) => s.id === subject.id)

  const subjects: SubjectOption[] = [
    {
      id: subject.id,
      code: 'RT',
      name: 'VFR RT',
      short: 'RT',
      questionCount: topics.reduce((sum, t) => sum + t.questionCount, 0),
    },
  ]

  return { id: subject.id, subjects, topics, examAvailable }
}
