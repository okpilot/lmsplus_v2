import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import type { VfrRtQuestion } from './vfr-rt-exam'

// Results / review read path (get_vfr_rt_exam_results — mig 106, ended_at-gated).

export type VfrRtResultAnswer = {
  blank_index: number | null
  selected_option_id: string | null
  response_text: string | null
  is_correct: boolean
}

export type VfrRtResultKey = {
  canonical_answer?: string
  accepted_synonyms?: string[]
  blanks?: Array<{ index: number; canonical: string; synonyms: string[] }>
  correct_option_id?: string
}

export type VfrRtReviewRow = {
  questionId: string
  questionType: 'short_answer' | 'dialog_fill' | 'multiple_choice'
  questionText: string
  questionImageUrl: string | null
  options: { id: string; text: string }[] | null
  answers: VfrRtResultAnswer[]
  key: VfrRtResultKey
  explanationText: string
  explanationImageUrl: string | null
  isCorrect: boolean // true when every answer.is_correct
}

export type VfrRtResults = {
  summary: {
    part1Pct: number
    part2Pct: number
    part3Pct: number
    passedOverall: boolean
    passedPerPart: { part1: boolean; part2: boolean; part3: boolean }
    correctCount: number
    totalQuestions: number
  }
  rows: VfrRtReviewRow[]
}

// Wire shape — numerics arrive as strings from PostgREST (NUMERIC/BIGINT rule §5)
type ResultsJson = {
  part1_pct: number | string
  part2_pct: number | string
  part3_pct: number | string
  passed_overall: boolean
  passed_per_part: { part1: boolean; part2: boolean; part3: boolean }
  correct_count: number | string
  total_questions: number | string
  questions: Array<{
    question_id: string
    question_type: 'short_answer' | 'dialog_fill' | 'multiple_choice'
    question_text: string
    answers: VfrRtResultAnswer[]
    key: VfrRtResultKey
    explanation_text: string
    explanation_image_url: string | null
  }>
}

export async function getVfrRtResults(sessionId: string): Promise<VfrRtResults | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    if (authError) console.error('[getVfrRtResults] Auth error:', authError.message)
    return null
  }

  const { data: resultsData, error: resultsError } = await rpc<ResultsJson>(
    supabase,
    'get_vfr_rt_exam_results',
    { p_session_id: sessionId },
  )
  if (resultsError || !resultsData) {
    console.error('[getVfrRtResults] Results RPC error:', resultsError?.message ?? 'null data')
    return null
  }
  // rpc<ResultsJson> is a typed assertion over jsonb — guard the array we map (§5).
  // A non-array here is backend corruption, not an expected "can't view yet" case
  // (those return null above → redirect). Throw so it surfaces via error.tsx + Sentry
  // instead of silently redirecting to the briefing (code-style.md §5 query-helper throw).
  if (!Array.isArray(resultsData.questions)) {
    throw new Error('Failed to fetch VFR RT results: questions field is not an array')
  }

  // get_vfr_rt_exam_questions (mig 105) gives us display fields: options + question_image_url
  // If this fails we still render from 106 alone (graceful degradation)
  const { data: questionsData, error: questionsError } = await rpc<VfrRtQuestion[]>(
    supabase,
    'get_vfr_rt_exam_questions',
    { p_session_id: sessionId },
  )
  if (questionsError) {
    console.error('[getVfrRtResults] Questions RPC error:', questionsError.message)
  }

  // Array.isArray, not just truthiness — a truthy non-array would crash for...of
  // and defeat the graceful-degradation contract.
  const displayMap = new Map<string, VfrRtQuestion>()
  if (Array.isArray(questionsData)) {
    for (const q of questionsData) {
      displayMap.set(q.id, q)
    }
  } else if (questionsData) {
    console.error('[getVfrRtResults] Questions RPC returned a non-array payload')
  }

  const rows: VfrRtReviewRow[] = resultsData.questions.map((q) => {
    const display = displayMap.get(q.question_id)
    if (!Array.isArray(q.answers)) {
      throw new Error('Failed to fetch VFR RT results: question answers field is not an array')
    }
    // every() is vacuously true on []; an unanswered question (timer-expiry or
    // partial submit returns answers: []) must show incorrect, not a ✓.
    const isCorrect = q.answers.length > 0 && q.answers.every((a) => a.is_correct)
    return {
      questionId: q.question_id,
      questionType: q.question_type,
      questionText: q.question_text,
      questionImageUrl: display?.question_image_url ?? null,
      options: display?.options ?? null,
      answers: q.answers,
      key: q.key,
      explanationText: q.explanation_text,
      explanationImageUrl: q.explanation_image_url,
      isCorrect,
    }
  })

  return {
    summary: {
      part1Pct: Number(resultsData.part1_pct),
      part2Pct: Number(resultsData.part2_pct),
      part3Pct: Number(resultsData.part3_pct),
      passedOverall: resultsData.passed_overall,
      passedPerPart: resultsData.passed_per_part,
      correctCount: Number(resultsData.correct_count),
      totalQuestions: Number(resultsData.total_questions),
    },
    rows,
  }
}
