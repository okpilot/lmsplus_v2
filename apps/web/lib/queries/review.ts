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

  const { data, error } = await supabase
    .from('fsrs_cards')
    .select('question_id, due, state')
    .eq('student_id' as string & keyof never, user.id)
    .lte('due' as string & keyof never, new Date().toISOString())
    .order('due' as string & keyof never, { ascending: true })
    .limit(limit)
    .returns<FsrsRow[]>()

  if (error) {
    console.error('[getDueCards] Query failed:', error.message)
    throw new Error('Failed to load due cards')
  }

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

  const { data: existingCards, error: cardsError } = await supabase
    .from('fsrs_cards')
    .select('question_id')
    .eq('student_id' as string & keyof never, user.id)
    .returns<{ question_id: string }[]>()

  if (cardsError) {
    console.error('[getNewQuestionIds] Cards query failed:', cardsError.message)
    throw new Error('Failed to load existing cards')
  }

  const seenIds = new Set((existingCards ?? []).map((c) => c.question_id))

  const { data: allQuestions, error: questionsError } = await supabase
    .from('questions')
    .select('id')
    .eq('status' as string & keyof never, 'active')
    .limit(limit + seenIds.size)
    .returns<QuestionIdRow[]>()

  if (questionsError) {
    console.error('[getNewQuestionIds] Questions query failed:', questionsError.message)
    throw new Error('Failed to load questions')
  }

  const newIds = (allQuestions ?? [])
    .map((q) => q.id)
    .filter((id) => !seenIds.has(id))
    .slice(0, limit)

  return newIds
}
