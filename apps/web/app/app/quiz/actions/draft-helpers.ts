import type { createServerSupabaseClient } from '@repo/db/server'
import type { Database, Json } from '@repo/db/types'
import type { AnswerFeedback, DraftAnswer, DraftResult } from '../types'

type QuizDraftInsert = Database['public']['Tables']['quiz_drafts']['Insert']
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type SaveDraftParsed = {
  draftId?: string
  sessionId: string
  questionIds: string[]
  answers: Record<string, DraftAnswer>
  feedback: Record<string, AnswerFeedback>
  currentIndex: number
  subjectName?: string
  subjectCode?: string
}

// Single source of truth for the saved-draft cap. Enforced at THREE points that
// must stay in sync: (1) insertNewDraft below (TS count gate), (2) the
// enforce_draft_limit DB trigger (mig 20260430000011, advisory-locked — hardcodes
// 20), and (3) the loadDrafts read bound (load-draft.ts: `.limit(MAX_DRAFTS)`).
// If this value changes, update the trigger migration's hardcoded 20 as well.
export const MAX_DRAFTS = 20

function sessionConfig(i: SaveDraftParsed) {
  return { sessionId: i.sessionId, subjectName: i.subjectName, subjectCode: i.subjectCode }
}

export async function updateExistingDraft(
  supabase: SupabaseClient,
  input: SaveDraftParsed,
  userId: string,
): Promise<DraftResult> {
  if (!input.draftId) {
    return { success: false, error: 'Invalid draft ID' }
  }
  // TypeScript resolves the Update payload type as `never` here due to complexity
  // limits on the generated Database type — the shape is correct per types.ts.
  const payload: Database['public']['Tables']['quiz_drafts']['Update'] = {
    question_ids: input.questionIds,
    answers: input.answers as Json,
    current_index: input.currentIndex,
    session_config: sessionConfig(input) as Json,
    feedback: input.feedback as Json,
  }
  const { data, error } = await supabase
    .from('quiz_drafts')
    .update(payload)
    .eq('id', input.draftId)
    .eq('student_id', userId)
    .select('id')
  if (error) {
    console.error('[saveDraft] Update error:', error.message)
    return { success: false, error: 'Failed to update draft' }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Draft not found or already deleted' }
  }
  return { success: true }
}

/** 4 params: supabase client, parsed input, user id, org id — each a distinct domain role */
export async function insertNewDraft(
  supabase: SupabaseClient,
  input: SaveDraftParsed,
  userId: string,
  orgId: string,
): Promise<DraftResult> {
  const { count, error: countError } = await supabase
    .from('quiz_drafts')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  if (countError) {
    console.error('[saveDraft] Draft count query error:', countError.message)
    return { success: false, error: 'Failed to save draft' }
  }
  if ((count ?? 0) >= MAX_DRAFTS)
    return { success: false, error: 'Maximum 20 saved quizzes reached.' }
  const row: QuizDraftInsert = {
    student_id: userId,
    organization_id: orgId,
    session_config: sessionConfig(input) as Json,
    question_ids: input.questionIds,
    answers: input.answers as Json,
    current_index: input.currentIndex,
    feedback: input.feedback as Json,
  }
  const { error } = await supabase.from('quiz_drafts').insert(row)
  if (error) {
    console.error('[saveDraft] Insert error:', error.message)
    return { success: false, error: 'Failed to save draft' }
  }
  return { success: true }
}
