import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { rpc } from '@/lib/supabase-rpc'
import type {
  SubjectOption,
  SubtopicOption,
  TopicOption,
  TopicWithSubtopics,
} from './quiz-query-types'

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type TopicRow = { id: string; code: string; name: string; sort_order: number }
type SubtopicRow = { id: string; code: string; name: string; sort_order: number; topic_id: string }
type QuestionCountRow = {
  subject_id: string
  topic_id: string
  subtopic_id: string | null
  // bigint COUNT(*) — PostgREST may serialize it as a string; coerce with Number() at every read site.
  n: number | string
}

async function fetchActiveQuestionCounts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<QuestionCountRow[]> {
  const { data, error } = await rpc<QuestionCountRow[]>(supabase, 'get_question_counts', {
    p_status: 'active',
  })
  if (error) {
    console.error('[fetchActiveQuestionCounts] get_question_counts error:', error.message)
    return []
  }
  // rpc() casts the payload without validating shape — guard the array per code-style §5.
  return Array.isArray(data) ? data : []
}

// Wrapped in React `cache()` for per-request memoization: both SubjectsSection
// (New Quiz / Saved tabs) and StudySection (Study mode tab) read this on every
// /quiz render, so without dedup the subjects+counts query would run twice per
// load. cache() is request-scoped — a no-op outside an RSC render, so unit tests
// that call it directly are unaffected — and transparent to all callers (no args).
export const getSubjectsWithCounts = cache(async (): Promise<SubjectOption[]> => {
  const supabase = await createServerSupabaseClient()

  // Intentional asymmetry: a subjects read error throws (page-critical data), while
  // fetchActiveQuestionCounts degrades to [] internally (counts are non-fatal).
  const [subjectsRes, countsData] = await Promise.all([
    supabase.from('easa_subjects').select('id, code, name, short, sort_order').order('sort_order'),
    fetchActiveQuestionCounts(supabase),
  ])

  if (subjectsRes.error) {
    throw new Error(`Failed to fetch subjects: ${subjectsRes.error.message}`)
  }

  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  if (!subjects.length) return []

  const countMap = new Map<string, number>()
  for (const row of countsData) {
    countMap.set(row.subject_id, (countMap.get(row.subject_id) ?? 0) + Number(row.n))
  }

  return subjects
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      short: s.short,
      questionCount: countMap.get(s.id) ?? 0,
    }))
    .filter((s) => s.questionCount > 0) // hide zero-count subjects
    .filter((s) => s.code !== 'RT') // RT has its own /app/vfr-rt page (R1.3)
})

export async function getTopicsForSubject(subjectId: string): Promise<TopicOption[]> {
  const supabase = await createServerSupabaseClient()

  const topicsRes = await supabase
    .from('easa_topics')
    .select('id, code, name, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order')

  if (topicsRes.error) {
    throw new Error(`Failed to fetch topics: ${topicsRes.error.message}`)
  }

  const topics = (topicsRes.data ?? []) as TopicRow[]
  if (!topics.length) return []

  const countsData = await fetchActiveQuestionCounts(supabase)

  const countMap = new Map<string, number>()
  for (const row of countsData) {
    if (row.subject_id !== subjectId) continue
    countMap.set(row.topic_id, (countMap.get(row.topic_id) ?? 0) + Number(row.n))
  }

  return topics
    .map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      questionCount: countMap.get(t.id) ?? 0,
    }))
    .filter((t) => t.questionCount > 0)
}

export async function getSubtopicsForTopic(topicId: string): Promise<SubtopicOption[]> {
  const supabase = await createServerSupabaseClient()

  const subtopicsRes = await supabase
    .from('easa_subtopics')
    .select('id, code, name, sort_order')
    .eq('topic_id', topicId)
    .order('sort_order')

  if (subtopicsRes.error) {
    throw new Error(`Failed to fetch subtopics: ${subtopicsRes.error.message}`)
  }

  const subtopics = (subtopicsRes.data ?? []) as SubtopicRow[]
  if (!subtopics.length) return []

  const countsData = await fetchActiveQuestionCounts(supabase)

  const countMap = new Map<string, number>()
  for (const row of countsData) {
    if (row.topic_id !== topicId || row.subtopic_id === null) continue
    countMap.set(row.subtopic_id, (countMap.get(row.subtopic_id) ?? 0) + Number(row.n))
  }

  return subtopics
    .map((st) => ({
      id: st.id,
      code: st.code,
      name: st.name,
      questionCount: countMap.get(st.id) ?? 0,
    }))
    .filter((st) => st.questionCount > 0)
}

export async function getTopicsWithSubtopics(subjectId: string): Promise<TopicWithSubtopics[]> {
  const supabase = await createServerSupabaseClient()

  const topicsRes = await supabase
    .from('easa_topics')
    .select('id, code, name, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order')

  if (topicsRes.error) {
    throw new Error(`Failed to fetch topics: ${topicsRes.error.message}`)
  }

  const topics = (topicsRes.data ?? []) as TopicRow[]
  if (!topics.length) return []

  const topicIds = topics.map((t) => t.id)

  const [subtopicsRes, countsData] = await Promise.all([
    supabase
      .from('easa_subtopics')
      .select('id, code, name, sort_order, topic_id')
      .in('topic_id', topicIds)
      .order('sort_order'),
    fetchActiveQuestionCounts(supabase),
  ])

  if (subtopicsRes.error) {
    throw new Error(`Failed to fetch subtopics: ${subtopicsRes.error.message}`)
  }

  const subtopics = (subtopicsRes.data ?? []) as SubtopicRow[]

  const topicCounts = new Map<string, number>()
  const subtopicCounts = new Map<string, number>()
  for (const row of countsData) {
    if (row.subject_id !== subjectId) continue
    topicCounts.set(row.topic_id, (topicCounts.get(row.topic_id) ?? 0) + Number(row.n))
    if (row.subtopic_id !== null) {
      subtopicCounts.set(
        row.subtopic_id,
        (subtopicCounts.get(row.subtopic_id) ?? 0) + Number(row.n),
      )
    }
  }

  const subtopicsByTopic = new Map<string, SubtopicOption[]>()
  for (const st of subtopics) {
    const count = subtopicCounts.get(st.id) ?? 0
    if (count === 0) continue
    const list = subtopicsByTopic.get(st.topic_id) ?? []
    list.push({ id: st.id, code: st.code, name: st.name, questionCount: count })
    subtopicsByTopic.set(st.topic_id, list)
  }

  return topics
    .map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      questionCount: topicCounts.get(t.id) ?? 0,
      subtopics: subtopicsByTopic.get(t.id) ?? [],
    }))
    .filter((t) => t.questionCount > 0)
}
