import { createServerSupabaseClient } from '@repo/db/server'

export type DueCard = {
  questionId: string
  due: string
  state: string
}

type FsrsRow = { question_id: string; due: string; state: string }
type QuestionIdRow = { id: string }

type GetDueCardsOpts = {
  limit?: number
  subjectIds?: string[]
}

export async function getDueCards(opts?: GetDueCardsOpts): Promise<DueCard[]> {
  const limit = opts?.limit ?? 20
  const subjectIds = opts?.subjectIds
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
    .limit(subjectIds?.length ? 500 : limit)
    .returns<FsrsRow[]>()

  if (error) {
    console.error('[getDueCards] Query failed:', error.message)
    throw new Error('Failed to load due cards')
  }

  let cards = (data ?? []).map((row) => ({
    questionId: row.question_id,
    due: row.due,
    state: row.state,
  }))

  if (subjectIds?.length) {
    cards = await filterBySubjects(supabase, cards, subjectIds, limit)
  }

  return cards
}

/** 4 params: each maps to a distinct role (client, data, filter, cap) */
async function filterBySubjects(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  cards: DueCard[],
  subjectIds: string[],
  limit: number,
): Promise<DueCard[]> {
  const questionIds = cards.map((c) => c.questionId)
  if (questionIds.length === 0) return []

  const { data } = await supabase
    .from('questions')
    .select('id')
    .in('id' as string & keyof never, questionIds)
    .in('subject_id' as string & keyof never, subjectIds)
    .returns<QuestionIdRow[]>()

  const validIds = new Set((data ?? []).map((q) => q.id))
  return cards.filter((c) => validIds.has(c.questionId)).slice(0, limit)
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
