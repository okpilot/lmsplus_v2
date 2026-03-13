'use server'

import { getSubtopicsForTopic, getTopicsForSubject } from '@/lib/queries/quiz'
import type { SubtopicOption, TopicOption } from '@/lib/queries/quiz'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const IdSchema = z.string().uuid()

export async function fetchTopicsForSubject(raw: unknown): Promise<TopicOption[]> {
  return getTopicsForSubject(IdSchema.parse(raw))
}

export async function fetchSubtopicsForTopic(raw: unknown): Promise<SubtopicOption[]> {
  return getSubtopicsForTopic(IdSchema.parse(raw))
}

const OptionalUuid = z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional())

const FilteredCountSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: OptionalUuid,
  subtopicId: OptionalUuid,
  filter: z.enum(['all', 'unseen', 'incorrect']),
})

type QuestionIdRow = { id: string }
type QuestionFilterRef = { question_id: string }

export async function getFilteredCount(input: unknown): Promise<{ count: number }> {
  const { subjectId, topicId, subtopicId, filter } = FilteredCountSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { count: 0 }

  let query = supabase
    .from('questions')
    .select('id')
    .eq('status' as string & keyof never, 'active')
    .eq('subject_id' as string & keyof never, subjectId)
    .is('deleted_at' as string & keyof never, null)

  if (topicId) query = query.eq('topic_id' as string & keyof never, topicId)
  if (subtopicId) query = query.eq('subtopic_id' as string & keyof never, subtopicId)

  const { data, error } = await query.returns<QuestionIdRow[]>()
  if (error) {
    console.error('[getFilteredCount] Questions query error:', error.message)
    return { count: 0 }
  }
  if (!data?.length) return { count: 0 }

  if (filter === 'all') return { count: data.length }

  const questionIds = data.map((q) => q.id)

  if (filter === 'unseen') {
    const { data: answered, error: answeredError } = await supabase
      .from('student_responses')
      .select('question_id')
      .eq('student_id' as string & keyof never, user.id)
      .in('question_id' as string & keyof never, questionIds)
      .returns<QuestionFilterRef[]>()
    if (answeredError) {
      console.error('[getFilteredCount] student_responses query error:', answeredError.message)
    }
    const answeredIds = new Set((answered ?? []).map((r) => r.question_id))
    return { count: data.filter((q) => !answeredIds.has(q.id)).length }
  }

  // filter === 'incorrect'
  const { data: incorrectCards, error: incorrectError } = await supabase
    .from('fsrs_cards')
    .select('question_id')
    .eq('student_id' as string & keyof never, user.id)
    .eq('last_was_correct' as string & keyof never, false)
    .in('question_id' as string & keyof never, questionIds)
    .returns<QuestionFilterRef[]>()
  if (incorrectError) {
    console.error('[getFilteredCount] fsrs_cards query error:', incorrectError.message)
  }
  const incorrectIds = new Set((incorrectCards ?? []).map((r) => r.question_id))
  return { count: data.filter((q) => incorrectIds.has(q.id)).length }
}
