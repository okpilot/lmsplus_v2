import { createServerSupabaseClient } from '@repo/db/server'

export type DueCard = {
  questionId: string
  due: string
  state: string
}

type FsrsRow = { question_id: string; due: string; state: string }
type QuestionIdRow = { id: string }

export async function getDueCards(limit = 20): Promise<DueCard[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data } = await supabase
    .from('fsrs_cards')
    .select('question_id, due, state')
    .eq('student_id' as string & keyof never, user.id)
    .lte('due' as string & keyof never, new Date().toISOString())
    .order('due' as string & keyof never, { ascending: true })
    .limit(limit)
    .returns<FsrsRow[]>()

  return (data ?? []).map((row) => ({
    questionId: row.question_id,
    due: row.due,
    state: row.state,
  }))
}

export async function getNewQuestionIds(limit = 20): Promise<string[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: existingCards } = await supabase
    .from('fsrs_cards')
    .select('question_id')
    .eq('student_id' as string & keyof never, user.id)
    .returns<{ question_id: string }[]>()

  const seenIds = new Set((existingCards ?? []).map((c) => c.question_id))

  const { data: allQuestions } = await supabase
    .from('questions')
    .select('id')
    .eq('status' as string & keyof never, 'active')
    .limit(limit + seenIds.size)
    .returns<QuestionIdRow[]>()

  const newIds = (allQuestions ?? [])
    .map((q) => q.id)
    .filter((id) => !seenIds.has(id))
    .slice(0, limit)

  return newIds
}
