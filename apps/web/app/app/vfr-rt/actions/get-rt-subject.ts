'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { getExamEnabledSubjects } from '@/lib/queries/exam-subjects'
import type { SubjectOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'
import { getVfrRtExamQuestionCount } from '@/lib/queries/vfr-rt-exam-question-count'

export type RtSubjectData = {
  id: string
  // Synthetic single-subject option for the reused quiz config machinery. Its `id`
  // equals the RT subject uuid — the session handoff derives subjectName/subjectCode
  // from it. Built here (data layer) so the RSC stays pure composition.
  subjects: SubjectOption[]
  topics: TopicWithSubtopics[]
  // available: the student's org has an enabled exam_config for RT (getExamEnabledSubjects; error → false).
  // questionCount: total questions the exam will draw; null when unavailable or not derivable.
  exam: { available: boolean; questionCount: number | null }
}

/** Resolves the RT subject id; null when RLS hides it (the student is not enrolled in VFR RT).
 * Throws on failure (page-critical); logs the raw DB error and throws a generic message
 * (code-style §5 — never embed Postgres error strings, which can leak schema detail). */
async function fetchRtSubjectId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  // easa_subjects has no deleted_at column (defined in mig 001, no soft-delete) — read-scope is enforced by RLS.
  const { data: subject, error } = await supabase
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .maybeSingle()
  if (error) {
    console.error('[getRtSubjectData] Subject lookup failed:', error.message)
    throw new Error('Failed to load VFR RT subject')
  }
  return subject?.id ?? null
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
 * (page-critical); returns null when the student is not enrolled in VFR RT; degrades to an empty topics list on a topics-fetch
 * failure (non-critical — the form just renders with zero topics).
 */
export async function getRtSubjectData(): Promise<RtSubjectData | null> {
  const [id, examSubjects] = await Promise.all([fetchRtSubjectId(), getExamEnabledSubjects()])
  if (id === null) return null
  const available = examSubjects.some((s) => s.id === id)
  const [topics, questionCount] = await Promise.all([
    fetchTopicsOrEmpty(id),
    available ? getVfrRtExamQuestionCount(id) : null,
  ])
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
    exam: { available, questionCount },
  }
}
