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
type QuestionIdRow = { id: string }
type QuestionFilterRef = { question_id: string }

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
  userId?: string
}): Promise<string[]> {
  // Explicit empty arrays = nothing selected → zero results
  if (
    (Array.isArray(opts.topicIds) && opts.topicIds.length === 0) ||
    (Array.isArray(opts.subtopicIds) && opts.subtopicIds.length === 0)
  ) {
    return []
  }

  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('questions')
    .select('id')
    .eq('status', 'active')
    .eq('subject_id', opts.subjectId)
    .is('deleted_at', null)

  // OR logic: match selected topics OR subtopics (AND would drop
  // leaf-topic questions whose subtopic_id is NULL)
  if (opts.topicIds?.length && opts.subtopicIds?.length) {
    query = query.or(
      `topic_id.in.(${opts.topicIds.join(',')}),subtopic_id.in.(${opts.subtopicIds.join(',')})`,
    )
  } else if (opts.topicIds?.length) {
    query = query.in('topic_id', opts.topicIds)
  } else if (opts.subtopicIds?.length) {
    query = query.in('subtopic_id', opts.subtopicIds)
  }

  const { data: rawData } = await query
  const data = (rawData ?? []) as QuestionIdRow[]

  if (!data.length) return []

  let filtered = data

  const activeFilters = opts.filters?.filter((f) => f !== 'all') ?? []
  // Guard narrowed above — extract to satisfy no-non-null-assertion rule
  const userId = opts.userId
  if (activeFilters.length > 0 && userId) {
    const matchingSets = await Promise.all(
      activeFilters.map((f) => {
        if (f === 'unseen') return filterUnseen(supabase, userId, filtered)
        if (f === 'incorrect') return filterIncorrect(supabase, userId, filtered)
        if (f === 'flagged') return filterFlagged(supabase, userId, filtered)
        return Promise.resolve(filtered)
      }),
    )
    const unionIds = new Set(matchingSets.flatMap((s) => s.map((q) => q.id)))
    filtered = filtered.filter((q) => unionIds.has(q.id))
  }

  const shuffled = filtered
    .map((q) => ({ id: q.id, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((q) => q.id)

  return shuffled.slice(0, opts.count)
}

async function filterUnseen(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  questions: QuestionIdRow[],
): Promise<QuestionIdRow[]> {
  if (!questions.length) return []
  const questionIds = questions.map((q) => q.id)
  const { data: answeredData, error } = await supabase
    .from('student_responses')
    .select('question_id')
    .eq('student_id', userId)
    .in('question_id', questionIds)
  if (error || !answeredData) {
    console.error('[filterUnseen] student_responses query error:', error?.message ?? 'null data')
    return []
  }

  const answered = answeredData as QuestionFilterRef[]
  const answeredIds = new Set(answered.map((r) => r.question_id))
  return questions.filter((q) => !answeredIds.has(q.id))
}

async function filterIncorrect(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  questions: QuestionIdRow[],
): Promise<QuestionIdRow[]> {
  if (!questions.length) return []
  const questionIds = questions.map((q) => q.id)
  const { data: incorrectData, error } = await supabase
    .from('fsrs_cards')
    .select('question_id')
    .eq('student_id', userId)
    .eq('last_was_correct', false)
    .in('question_id', questionIds)
  if (error || !incorrectData) {
    console.error('[filterIncorrect] fsrs_cards query error:', error?.message ?? 'null data')
    return []
  }

  const incorrectCards = incorrectData as QuestionFilterRef[]
  const incorrectIds = new Set(incorrectCards.map((r) => r.question_id))
  return questions.filter((q) => incorrectIds.has(q.id))
}

type UntypedClient = {
  from: (table: string) => {
    select: (col: string) => UntypedQuery
  }
}
type UntypedQuery = {
  eq: (col: string, val: unknown) => UntypedQuery
  is: (col: string, val: unknown) => UntypedQuery
  in: (
    col: string,
    vals: unknown[],
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
}

async function filterFlagged(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  questions: QuestionIdRow[],
): Promise<QuestionIdRow[]> {
  if (!questions.length) return []
  const questionIds = questions.map((q) => q.id)
  // active_flagged_questions view is not yet in the generated DB types — cast via unknown
  const client = supabase as unknown as UntypedClient
  const { data: flaggedData, error } = await client
    .from('active_flagged_questions')
    .select('question_id')
    .eq('student_id', userId)
    .in('question_id', questionIds)
  if (error) {
    console.error('[filterFlagged] active_flagged_questions query error:', error.message)
    return []
  }
  const flaggedIds = new Set(((flaggedData ?? []) as QuestionFilterRef[]).map((r) => r.question_id))
  return questions.filter((q) => flaggedIds.has(q.id))
}
