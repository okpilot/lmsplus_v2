'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import type { AnswerFeedback, DraftData, LoadDraftsResult } from '../types'

type QuizDraftRow = Database['public']['Tables']['quiz_drafts']['Row']
type SessionConfig = { sessionId: string; subjectName?: string; subjectCode?: string }

function isSessionConfig(v: unknown): v is SessionConfig {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).sessionId === 'string'
  )
}

function isFeedbackRecord(v: unknown): v is Record<string, AnswerFeedback> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v).every(
    (e) =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as Record<string, unknown>).isCorrect === 'boolean' &&
      typeof (e as Record<string, unknown>).correctOptionId === 'string',
  )
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
      answers: row.answers as Record<string, { selectedOptionId: string; responseTimeMs: number }>,
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
