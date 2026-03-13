'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import type { DraftData, LoadDraftsResult } from '../types'

type QuizDraftRow = Database['public']['Tables']['quiz_drafts']['Row']
type SessionConfig = { sessionId: string; subjectName?: string; subjectCode?: string }

function rowToDraftData(row: QuizDraftRow): DraftData {
  const config = row.session_config as SessionConfig
  return {
    id: row.id,
    sessionId: config.sessionId,
    questionIds: row.question_ids,
    answers: row.answers as Record<string, { selectedOptionId: string; responseTimeMs: number }>,
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
    } = await supabase.auth.getUser()
    if (!user) return { drafts: [] }

    const { data, error } = await supabase
      .from('quiz_drafts' as 'users')
      .select('*')
      .eq('student_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[loadDrafts] Query error:', error.message)
      return { drafts: [] }
    }

    const rows = (data ?? []) as unknown as QuizDraftRow[]
    return { drafts: rows.map(rowToDraftData) }
  } catch (err) {
    console.error('[loadDrafts] Uncaught error:', err)
    return { drafts: [] }
  }
}
