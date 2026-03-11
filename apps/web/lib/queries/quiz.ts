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

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type TopicRow = { id: string; code: string; name: string; sort_order: number }
type QuestionRefRow = { subject_id: string }
type QuestionTopicRow = { topic_id: string }
type QuestionIdRow = { id: string }

export async function getSubjectsWithCounts(): Promise<SubjectOption[]> {
  const supabase = await createServerSupabaseClient()

  const { data: subjects } = await supabase
    .from('easa_subjects')
    .select('id, code, name, short, sort_order')
    .order('sort_order')
    .returns<SubjectRow[]>()

  if (!subjects?.length) return []

  const { data: counts } = await supabase
    .from('questions')
    .select('subject_id')
    .eq('status' as string & keyof never, 'active')
    .returns<QuestionRefRow[]>()

  const countMap = new Map<string, number>()
  for (const q of counts ?? []) {
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

  const { data: topics } = await supabase
    .from('easa_topics')
    .select('id, code, name, sort_order')
    .eq('subject_id' as string & keyof never, subjectId)
    .order('sort_order')
    .returns<TopicRow[]>()

  if (!topics?.length) return []

  const { data: counts } = await supabase
    .from('questions')
    .select('topic_id')
    .eq('status' as string & keyof never, 'active')
    .eq('subject_id' as string & keyof never, subjectId)
    .returns<QuestionTopicRow[]>()

  const countMap = new Map<string, number>()
  for (const q of counts ?? []) {
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

export async function getRandomQuestionIds(opts: {
  subjectId: string
  topicId?: string | null
  count: number
}): Promise<string[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('questions')
    .select('id')
    .eq('status' as string & keyof never, 'active')
    .eq('subject_id' as string & keyof never, opts.subjectId)

  if (opts.topicId) {
    query = query.eq('topic_id' as string & keyof never, opts.topicId)
  }

  const { data } = await query.returns<QuestionIdRow[]>()

  if (!data?.length) return []

  // Shuffle and take requested count
  const shuffled = data
    .map((q) => ({ id: q.id, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((q) => q.id)

  return shuffled.slice(0, opts.count)
}
