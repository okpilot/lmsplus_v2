'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { SubtopicOption, TopicOption, TopicWithSubtopics } from '@/lib/queries/quiz'
import {
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz'

const IdSchema = z.string().uuid()

export async function fetchTopicsForSubject(raw: unknown): Promise<TopicOption[]> {
  return getTopicsForSubject(IdSchema.parse(raw))
}

export async function fetchSubtopicsForTopic(raw: unknown): Promise<SubtopicOption[]> {
  return getSubtopicsForTopic(IdSchema.parse(raw))
}

export async function fetchTopicsWithSubtopics(raw: unknown): Promise<TopicWithSubtopics[]> {
  return getTopicsWithSubtopics(IdSchema.parse(raw))
}

const FilteredCountSchema = z.object({
  subjectId: z.string().uuid(),
  topicIds: z.array(z.string().uuid()).optional(),
  subtopicIds: z.array(z.string().uuid()).optional(),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
})

type QuestionIdRow = { id: string }
type QuestionFilterRef = { question_id: string }
type UntypedQuery = {
  eq: (col: string, val: unknown) => UntypedQuery
  is: (col: string, val: unknown) => UntypedQuery
  in: (col: string, vals: unknown[]) => Promise<{ data: unknown[] | null }>
}
type UntypedClient = { from: (table: string) => { select: (col: string) => UntypedQuery } }

async function applyUnionFilters(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  questions: QuestionIdRow[]
  filters: string[]
}): Promise<QuestionIdRow[]> {
  const { supabase, userId, questions, filters } = opts
  const questionIds = questions.map((q) => q.id)

  const sets = await Promise.all(
    filters.map(async (f) => {
      if (f === 'unseen') {
        const { data } = await supabase
          .from('student_responses')
          .select('question_id')
          .eq('student_id', userId)
          .in('question_id', questionIds)
        const answeredIds = new Set(((data ?? []) as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => !answeredIds.has(q.id))
      }
      if (f === 'incorrect') {
        const { data } = await supabase
          .from('fsrs_cards')
          .select('question_id')
          .eq('student_id', userId)
          .eq('last_was_correct', false)
          .in('question_id', questionIds)
        const ids = new Set(((data ?? []) as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => ids.has(q.id))
      }
      if (f === 'flagged') {
        // flagged_questions is not yet in the generated DB types — cast via unknown
        const client = supabase as unknown as UntypedClient
        const { data } = await client
          .from('flagged_questions')
          .select('question_id')
          .eq('student_id', userId)
          .is('deleted_at', null)
          .in('question_id', questionIds)
        const ids = new Set(((data ?? []) as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => ids.has(q.id))
      }
      return questions
    }),
  )

  const unionIds = new Set(sets.flatMap((s) => s.map((q) => q.id)))
  return questions.filter((q) => unionIds.has(q.id))
}

export async function getFilteredCount(input: unknown): Promise<{ count: number }> {
  const { subjectId, topicIds, subtopicIds, filters } = FilteredCountSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { count: 0 }

  let query = supabase
    .from('questions')
    .select('id')
    .eq('status', 'active')
    .eq('subject_id', subjectId)
    .is('deleted_at', null)

  if (topicIds?.length) query = query.in('topic_id', topicIds)
  if (subtopicIds?.length) query = query.in('subtopic_id', subtopicIds)

  const { data: rawData, error } = await query
  if (error) {
    console.error('[getFilteredCount] Questions query error:', error.message)
    return { count: 0 }
  }
  const data = (rawData ?? []) as QuestionIdRow[]
  if (!data.length) return { count: 0 }

  const activeFilters = filters.filter((f) => f !== 'all')
  if (!activeFilters.length) return { count: data.length }

  const result = await applyUnionFilters({
    supabase,
    userId: user.id,
    questions: data,
    filters: activeFilters,
  })
  return { count: result.length }
}
