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
  // The RT exam_config time limit in seconds; null when no enabled exam config exists.
  examTimeLimitSeconds: number | null
}

/** Throws on failure (page-critical); logs the raw DB error and throws a generic message
 * (code-style §5 — never embed Postgres error strings, which can leak schema detail). */
async function fetchRtSubjectId(): Promise<string> {
  const supabase = await createServerSupabaseClient()
  // easa_subjects has no deleted_at column (defined in mig 001, no soft-delete) — read-scope is enforced by RLS.
  const { data: subject, error } = await supabase
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()
  if (error || !subject) {
    console.error('[getRtSubjectData] Subject lookup failed:', error?.message ?? 'not found')
    throw new Error('Failed to load VFR RT subject')
  }
  return subject.id
}

/** Non-critical: a topics-fetch failure is logged and degrades to an empty list. */
async function fetchTopicsOrEmpty(subjectId: string): Promise<TopicWithSubtopics[]> {
  try {
    return await getTopicsWithSubtopics(subjectId)
  } catch (e: unknown) {
    console.error('[getRtSubjectData] Topics fetch failed:', e instanceof Error ? e.message : e)
    return []
  }
}

/**
 * Loads the RT subject id and its topics/subtopics server-side, so the RSC
 * (VfrRtSetup) can seed the reused quiz topic-tree hook with initial state
 * instead of a client mount-time fetch. Throws on subject-lookup failure
 * (page-critical); degrades to an empty topics list on a topics-fetch
 * failure (non-critical — the form just renders with zero topics).
 */
export async function getRtSubjectData(): Promise<RtSubjectData> {
  const id = await fetchRtSubjectId()
  const [topics, examSubjects] = await Promise.all([
    fetchTopicsOrEmpty(id),
    getExamEnabledSubjects(),
  ])
  const rtExam = examSubjects.find((s) => s.id === id)
  const subjects: SubjectOption[] = [
    {
      id,
      code: 'RT',
      name: 'VFR RT',
      short: 'RT',
      questionCount: topics.reduce((sum, t) => sum + t.questionCount, 0),
    },
  ]
  return {
    id,
    subjects,
    topics,
    examAvailable: rtExam !== undefined,
    examTimeLimitSeconds: rtExam?.timeLimitSeconds ?? null,
  }
}
