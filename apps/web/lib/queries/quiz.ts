import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

export type SubjectOption = {
  id: string
  code: string
  name: string
  short: string
  questionCount: number
}

export type TopicOption = {
  id: string
  code: string
  name: string
  questionCount: number
}

export type SubtopicOption = {
  id: string
  code: string
  name: string
  questionCount: number
}

export type TopicWithSubtopics = {
  id: string
  code: string
  name: string
  questionCount: number
  subtopics: SubtopicOption[]
}

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

export type QuestionFilter = 'all' | 'unseen' | 'incorrect' | 'flagged'

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

export async function getSubjectsWithCounts(): Promise<SubjectOption[]> {
  const supabase = await createServerSupabaseClient()

  const [{ data: subjectsData }, countsData] = await Promise.all([
    supabase.from('easa_subjects').select('id, code, name, short, sort_order').order('sort_order'),
    fetchActiveQuestionCounts(supabase),
  ])

  const subjects = (subjectsData ?? []) as SubjectRow[]
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
    .filter((s) => s.questionCount > 0)
}

export async function getTopicsForSubject(subjectId: string): Promise<TopicOption[]> {
  const supabase = await createServerSupabaseClient()

  const { data: topicsData } = await supabase
    .from('easa_topics')
    .select('id, code, name, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order')

  const topics = (topicsData ?? []) as TopicRow[]
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

  const { data: subtopicsData } = await supabase
    .from('easa_subtopics')
    .select('id, code, name, sort_order')
    .eq('topic_id', topicId)
    .order('sort_order')

  const subtopics = (subtopicsData ?? []) as SubtopicRow[]
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

  const { data: topicsData } = await supabase
    .from('easa_topics')
    .select('id, code, name, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order')

  const topics = (topicsData ?? []) as TopicRow[]
  if (!topics.length) return []

  const topicIds = topics.map((t) => t.id)

  const [{ data: subtopicsData }, countsData] = await Promise.all([
    supabase
      .from('easa_subtopics')
      .select('id, code, name, sort_order, topic_id')
      .in('topic_id', topicIds)
      .order('sort_order'),
    fetchActiveQuestionCounts(supabase),
  ])

  const subtopics = (subtopicsData ?? []) as SubtopicRow[]

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

export async function getRandomQuestionIds(opts: {
  subjectId: string
  topicIds?: string[]
  subtopicIds?: string[]
  count: number
  filters?: QuestionFilter[]
}): Promise<string[]> {
  const supabase = await createServerSupabaseClient()
  const { subjectId, topicIds, subtopicIds, count, filters } = opts
  const activeFilters = filters?.filter((f) => f !== 'all') ?? []

  // undefined → null to RPC = unconstrained (whole subject pool); [] → empty array = match nothing (topic_id = ANY('{}') is always false).
  const { data, error } = await rpc<{ id: string }[]>(supabase, 'get_random_question_ids', {
    p_subject_id: subjectId,
    p_topic_ids: topicIds ?? null,
    p_subtopic_ids: subtopicIds ?? null,
    p_count: count,
    p_filters: activeFilters,
  })
  if (error) {
    console.error('[getRandomQuestionIds] get_random_question_ids error:', error.message)
    return []
  }
  if (!Array.isArray(data)) return []
  // Per-row guard required by code-style.md §5 — the `rpc<{id: string}[]>` cast is
  // a TypeScript assertion only, not a runtime guarantee. Drop rows that don't
  // carry a string id; otherwise `undefined` would leak into start_quiz_session's
  // uuid[] arg and trigger a Postgres type error.
  return data
    .map((r) => (r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string')
}
