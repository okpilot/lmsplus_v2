import { upsert } from '@/lib/supabase-rpc'
import {
  createEmptyCard,
  dbRowToCard,
  ratingFromAnswer,
  scheduleCard,
  stateToString,
} from '@repo/db/fsrs'
import type { createServerSupabaseClient } from '@repo/db/server'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type FsrsCardRow = {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: string
  last_review: string | null
  last_was_correct: boolean | null
  consecutive_correct_count: number | null
}

/**
 * Best-effort FSRS card scheduling. Logs errors but never throws,
 * so a scheduling failure does not mask a successful answer.
 */
export async function updateFsrsCard(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
  isCorrect: boolean,
) {
  const { data: rawExisting, error: cardError } = await supabase
    .from('fsrs_cards')
    .select(
      'due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, last_was_correct, consecutive_correct_count',
    )
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .maybeSingle()

  const existing = rawExisting as FsrsCardRow | null

  if (cardError) {
    console.error('FSRS card lookup failed:', cardError.message)
    return
  }

  const card = existing ? dbRowToCard(existing) : createEmptyCard()
  const grade = ratingFromAnswer(isCorrect)
  const scheduled = scheduleCard(card, grade)
  const next = scheduled.card

  try {
    await upsert(
      supabase,
      'fsrs_cards',
      {
        student_id: userId,
        question_id: questionId,
        due: next.due.toISOString(),
        stability: next.stability,
        difficulty: next.difficulty,
        elapsed_days: next.elapsed_days,
        scheduled_days: next.scheduled_days,
        reps: next.reps,
        lapses: next.lapses,
        state: stateToString(next.state),
        last_review: new Date().toISOString(),
        last_was_correct: isCorrect,
        consecutive_correct_count: isCorrect ? (existing?.consecutive_correct_count ?? 0) + 1 : 0,
      },
      { onConflict: 'student_id,question_id' },
    )
  } catch (err) {
    console.error('FSRS card upsert failed:', err)
  }
}
