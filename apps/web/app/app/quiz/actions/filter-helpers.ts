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

export async function applyFilters(opts: {
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
        const { data, error } = await supabase
          .from('student_responses')
          .select('question_id')
          .eq('student_id', userId)
          .in('question_id', questionIds)
        if (error) {
          console.error('[applyFilters] student_responses query error:', error.message)
          return []
        }
        const answeredIds = new Set((data as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => !answeredIds.has(q.id))
      }
      if (f === 'incorrect') {
        const { data, error } = await supabase
          .from('fsrs_cards')
          .select('question_id')
          .eq('student_id', userId)
          .eq('last_was_correct', false)
          .in('question_id', questionIds)
        if (error) {
          console.error('[applyFilters] fsrs_cards query error:', error.message)
          return []
        }
        const ids = new Set((data as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => ids.has(q.id))
      }
      if (f === 'flagged') {
        // active_flagged_questions view is not yet in the generated DB types — cast via unknown
        const client = supabase as unknown as UntypedClient
        const { data, error } = await client
          .from('active_flagged_questions')
          .select('question_id')
          .eq('student_id', userId)
          .in('question_id', questionIds)
        if (error) {
          console.error('[applyFilters] active_flagged_questions query error:', error.message)
          return []
        }
        const ids = new Set(((data ?? []) as QuestionFilterRef[]).map((r) => r.question_id))
        return questions.filter((q) => ids.has(q.id))
      }
      return questions
    }),
  )

  // Intersection: question must match ALL active filters
  const idSets = sets.map((s) => new Set(s.map((q) => q.id)))
  if (idSets.length === 0) return questions
  // idSets[0] is safe — guarded by idSets.length === 0 check above
  const intersection = idSets.slice(1).reduce<Set<string>>((acc, s) => {
    const result = new Set<string>()
    for (const id of acc) {
      if (s.has(id)) result.add(id)
    }
    return result
  }, idSets[0]!)
  return questions.filter((q) => intersection.has(q.id))
}
