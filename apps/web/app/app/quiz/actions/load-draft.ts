'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import type { LoadDraftResult } from '../types'

type QuizDraftRow = Database['public']['Tables']['quiz_drafts']['Row']
type SessionConfig = { sessionId: string; subjectName?: string; subjectCode?: string }

export async function loadDraft(): Promise<LoadDraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { draft: null }

    const { data, error } = await supabase
      .from('quiz_drafts' as 'users')
      .select('*')
      .eq('student_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[loadDraft] Query error:', error.message)
      return { draft: null }
    }

    if (!data) return { draft: null }

    const row = data as unknown as QuizDraftRow
    const config = row.session_config as SessionConfig
    return {
      draft: {
        id: row.id,
        sessionId: config.sessionId,
        questionIds: row.question_ids,
        answers: row.answers as Record<
          string,
          { selectedOptionId: string; responseTimeMs: number }
        >,
        currentIndex: row.current_index,
        subjectName: config.subjectName,
        subjectCode: config.subjectCode,
        createdAt: row.created_at,
      },
    }
  } catch (err) {
    console.error('[loadDraft] Uncaught error:', err)
    return { draft: null }
  }
}
