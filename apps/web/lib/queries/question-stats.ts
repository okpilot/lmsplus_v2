import { createServerSupabaseClient } from '@repo/db/server'

export type QuestionStats = {
  timesSeen: number
  correctCount: number
  incorrectCount: number
  lastAnswered: string | null
}

export async function getQuestionStats(questionId: string): Promise<QuestionStats> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const rows = await fetchResponses(supabase, user.id, questionId)
  const total = rows.length
  const correct = rows.filter((r) => r.is_correct).length

  return {
    timesSeen: total,
    correctCount: correct,
    incorrectCount: total - correct,
    lastAnswered: rows[0]?.created_at ?? null,
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const MAX_RESPONSE_ROWS = 500

async function fetchResponses(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
): Promise<{ is_correct: boolean; created_at: string }[]> {
  const { data, error } = await supabase
    .from('student_responses')
    .select('is_correct, created_at')
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(MAX_RESPONSE_ROWS)

  if (error) throw new Error(`Failed to fetch responses: ${error.message}`)

  return data ?? []
}
