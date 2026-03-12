import { createServerSupabaseClient } from '@repo/db/server'

export type QuestionStats = {
  timesSeen: number
  correctCount: number
  incorrectCount: number
  lastAnswered: string | null
  fsrsState: string | null
  fsrsStability: number | null
  fsrsDifficulty: number | null
  fsrsInterval: number | null
}

type FsrsRow = {
  state: string
  stability: number
  difficulty: number
  scheduled_days: number
  last_review: string | null
}

export async function getQuestionStats(questionId: string): Promise<QuestionStats> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const [responseCounts, fsrsCard, lastResponse] = await Promise.all([
    getResponseCounts(supabase, user.id, questionId),
    getFsrsCard(supabase, user.id, questionId),
    getLastResponse(supabase, user.id, questionId),
  ])

  return {
    timesSeen: responseCounts.total,
    correctCount: responseCounts.correct,
    incorrectCount: responseCounts.total - responseCounts.correct,
    lastAnswered: lastResponse,
    fsrsState: fsrsCard?.state ?? null,
    fsrsStability: fsrsCard?.stability ?? null,
    fsrsDifficulty: fsrsCard?.difficulty ?? null,
    fsrsInterval: fsrsCard?.scheduled_days ?? null,
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function getResponseCounts(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
): Promise<{ total: number; correct: number }> {
  const [totalResult, correctResult] = await Promise.all([
    supabase
      .from('student_responses')
      .select('*', { count: 'exact', head: true })
      .eq('student_id' as string & keyof never, userId)
      .eq('question_id' as string & keyof never, questionId),
    supabase
      .from('student_responses')
      .select('*', { count: 'exact', head: true })
      .eq('student_id' as string & keyof never, userId)
      .eq('question_id' as string & keyof never, questionId)
      .eq('is_correct' as string & keyof never, true),
  ])

  if (totalResult.error) throw new Error(`Failed to count responses: ${totalResult.error.message}`)
  if (correctResult.error)
    throw new Error(`Failed to count correct responses: ${correctResult.error.message}`)

  return { total: totalResult.count ?? 0, correct: correctResult.count ?? 0 }
}

async function getFsrsCard(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
): Promise<FsrsRow | null> {
  const { data, error } = await supabase
    .from('fsrs_cards')
    .select('state, stability, difficulty, scheduled_days, last_review')
    .eq('student_id' as string & keyof never, userId)
    .eq('question_id' as string & keyof never, questionId)
    .returns<FsrsRow[]>()
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch FSRS card: ${error.message}`)

  return data
}

async function getLastResponse(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('student_responses')
    .select('created_at')
    .eq('student_id' as string & keyof never, userId)
    .eq('question_id' as string & keyof never, questionId)
    .order('created_at' as string & keyof never, { ascending: false })
    .limit(1)
    .returns<{ created_at: string }[]>()

  if (error) throw new Error(`Failed to fetch last response: ${error.message}`)

  return data?.[0]?.created_at ?? null
}
