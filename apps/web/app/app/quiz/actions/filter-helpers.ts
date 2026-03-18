import type { createServerSupabaseClient } from '@repo/db/server'

export type QuestionIdRow = { id: string }
export type QuestionFilterRef = { question_id: string }
export type UntypedQuery = {
  eq: (col: string, val: unknown) => UntypedQuery
  is: (col: string, val: unknown) => UntypedQuery
  in: (
    col: string,
    vals: unknown[],
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
}
export type UntypedClient = { from: (table: string) => { select: (col: string) => UntypedQuery } }

export async function applyUnionFilters(opts: {
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
        const { data, error } = await client
          .from('flagged_questions')
          .select('question_id')
          .eq('student_id', userId)
          .is('deleted_at', null)
          .in('question_id', questionIds)
        if (error) {
          console.error('[applyUnionFilters] flagged_questions query error:', error.message)
          return []
        }
        const ids = new Set(((data ?? []) as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => ids.has(q.id))
      }
      return questions
    }),
  )

  const unionIds = new Set(sets.flatMap((s) => s.map((q) => q.id)))
  return questions.filter((q) => unionIds.has(q.id))
}
