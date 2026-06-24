'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import type { AnswerFeedback, DraftAnswer, DraftData, LoadDraftsResult } from '../types'
import { MAX_DRAFTS } from './draft-helpers'

type QuizDraftRow = Database['public']['Tables']['quiz_drafts']['Row']
type SessionConfig = { sessionId: string; subjectName?: string; subjectCode?: string }

function isSessionConfig(v: unknown): v is SessionConfig {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).sessionId === 'string'
  )
}

function isFeedbackEntry(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const r = e as Record<string, unknown>
  if (typeof r.isCorrect !== 'boolean') return false
  // Tag-aware, with a legacy fallback: pre-discriminant MC feedback has no
  // `questionType` but carries a string `correctOptionId`.
  switch (r.questionType) {
    case 'multiple_choice':
    case undefined:
      return typeof r.correctOptionId === 'string'
    case 'short_answer':
      return r.correctAnswer === null || typeof r.correctAnswer === 'string'
    case 'dialog_fill':
      // Shallow check is deliberate here: this guards the trusted-ish DB draft row.
      // The localStorage path (quiz-session-validators isValidDialogFillFeedback)
      // does the deep per-blank shape check, since that source is client-writable.
      return Array.isArray(r.blanks)
    default:
      return false
  }
}

function isFeedbackRecord(v: unknown): v is Record<string, AnswerFeedback> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v).every(isFeedbackEntry)
}

function rowToDraftData(row: QuizDraftRow): DraftData {
  const raw = row.session_config
  const rawFeedback = (row as unknown as { feedback?: unknown }).feedback
  const feedback = isFeedbackRecord(rawFeedback) ? rawFeedback : undefined
  if (!isSessionConfig(raw)) {
    console.error('[rowToDraftData] Malformed session_config on draft', row.id)
    return {
      id: row.id,
      sessionId: '',
      questionIds: row.question_ids,
      answers: row.answers as Record<string, DraftAnswer>,
      feedback: feedback ?? undefined,
      currentIndex: row.current_index,
      subjectName: undefined,
      subjectCode: undefined,
      createdAt: row.created_at,
    }
  }
  const config = raw
  return {
    id: row.id,
    sessionId: config.sessionId,
    questionIds: row.question_ids,
    answers: row.answers as Record<string, { selectedOptionId: string; responseTimeMs: number }>,
    feedback: feedback ?? undefined,
    currentIndex: row.current_index,
    subjectName: config.subjectName,
    subjectCode: config.subjectCode,
    createdAt: row.created_at,
  }
}

export async function loadDrafts(): Promise<LoadDraftsResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { drafts: [] }

    const { data, error } = await supabase
      .from('quiz_drafts')
      .select('*')
      .eq('student_id', user.id)
      .order('updated_at', { ascending: false })
      // Deliberate bound matching the insert-time cap enforced in insertNewDraft
      // (draft-helpers.ts: rejects count >= MAX_DRAFTS). Makes the read bound
      // explicit instead of relying on PostgREST's implicit max_rows truncation.
      .limit(MAX_DRAFTS)

    if (error) {
      console.error('[loadDrafts] Query error:', error.message)
      return { drafts: [] }
    }

    return { drafts: (data ?? []).map(rowToDraftData) }
  } catch (err) {
    console.error('[loadDrafts] Uncaught error:', err)
    return { drafts: [] }
  }
}
