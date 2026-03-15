import { createServerSupabaseClient } from '@repo/db/server'

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

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type TopicRow = { id: string; code: string; name: string; sort_order: number }
type SubtopicRow = { id: string; code: string; name: string; sort_order: number }
type QuestionRefRow = { subject_id: string }
type QuestionTopicRow = { topic_id: string }
type QuestionSubtopicRow = { subtopic_id: string }
type QuestionIdRow = { id: string }

export async function getSubjectsWithCounts(): Promise<SubjectOption[]> {
  const supabase = await createServerSupabaseClient()

  const { data: subjectsData } = await supabase
    .from('easa_subjects')
    .select('id, code, name, short, sort_order')
    .order('sort_order')

  const subjects = (subjectsData ?? []) as SubjectRow[]
  if (!subjects.length) return []

  const { data: countsData } = await supabase
    .from('questions')
    .select('subject_id')
    .eq('status', 'active')
    .is('deleted_at', null)

  const counts = (countsData ?? []) as QuestionRefRow[]

  const countMap = new Map<string, number>()
  for (const q of counts) {
    countMap.set(q.subject_id, (countMap.get(q.subject_id) ?? 0) + 1)
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

  const { data: countsData } = await supabase
    .from('questions')
    .select('topic_id')
    .eq('status', 'active')
    .eq('subject_id', subjectId)
    .is('deleted_at', null)

  const counts = (countsData ?? []) as QuestionTopicRow[]

  const countMap = new Map<string, number>()
  for (const q of counts) {
    countMap.set(q.topic_id, (countMap.get(q.topic_id) ?? 0) + 1)
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

  const { data: countsData } = await supabase
    .from('questions')
    .select('subtopic_id')
    .eq('status', 'active')
    .eq('topic_id', topicId)
    .is('deleted_at', null)

  const counts = (countsData ?? []) as QuestionSubtopicRow[]

  const countMap = new Map<string, number>()
  for (const q of counts) {
    countMap.set(q.subtopic_id, (countMap.get(q.subtopic_id) ?? 0) + 1)
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

type QuestionFilterRef = { question_id: string }

export type QuestionFilter = 'all' | 'unseen' | 'incorrect'

export async function getRandomQuestionIds(opts: {
  subjectId: string
  topicId?: string | null
  subtopicId?: string | null
  count: number
  filter?: QuestionFilter
  userId?: string
}): Promise<string[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('questions')
    .select('id')
    .eq('status', 'active')
    .eq('subject_id', opts.subjectId)
    .is('deleted_at', null)

  if (opts.topicId) {
    query = query.eq('topic_id', opts.topicId)
  }

  if (opts.subtopicId) {
    query = query.eq('subtopic_id', opts.subtopicId)
  }

  const { data: rawData } = await query
  const data = (rawData ?? []) as QuestionIdRow[]

  if (!data.length) return []

  let filtered = data
  const filter = opts.filter ?? 'all'

  if (filter === 'unseen' && opts.userId) {
    filtered = await filterUnseen(supabase, opts.userId, data)
  } else if (filter === 'incorrect' && opts.userId) {
    filtered = await filterIncorrect(supabase, opts.userId, data)
  }

  // Shuffle and take requested count
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
  const { data: answeredData } = await supabase
    .from('student_responses')
    .select('question_id')
    .eq('student_id', userId)

  const answered = (answeredData ?? []) as QuestionFilterRef[]
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
  const { data: incorrectData } = await supabase
    .from('fsrs_cards')
    .select('question_id')
    .eq('student_id', userId)
    .eq('last_was_correct', false)
    .in('question_id', questionIds)

  const incorrectCards = (incorrectData ?? []) as QuestionFilterRef[]
  const incorrectIds = new Set(incorrectCards.map((r) => r.question_id))
  return questions.filter((q) => incorrectIds.has(q.id))
}
