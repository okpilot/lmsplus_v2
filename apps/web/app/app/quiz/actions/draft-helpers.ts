import type { createServerSupabaseClient } from '@repo/db/server'
import type { Database, Json } from '@repo/db/types'
import { PRACTICE_MODES } from '@/lib/constants/exam-modes'
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

/**
 * Park a saved draft's underlying practice session: soft-delete the `quiz_sessions`
 * row so it stops tripping the single-active-session guard (#1011) and the
 * "unfinished session" banner (#1085). Best-effort — the draft is already saved, so
 * a failure here only leaves the pre-fix state (a lingering active session), never
 * loses the draft. Positive practice-mode allowlist: this must NEVER soft-delete a
 * graded exam (`internal_exam` / `vfr_rt_exam` / `mock_exam`) — a student could
 * otherwise abandon a graded exam via a crafted saveDraft call (the discard path
 * blocks this via NON_DISCARDABLE_MODES; we use a stricter positive allowlist).
 */
export async function closePracticeSessionForDraft(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  // Fully best-effort: the draft is already saved, so this must NEVER surface as a
  // save failure — swallow both query errors AND thrown exceptions (network etc.),
  // logging for observability. Rethrowing would make the caller's outer catch report
  // failure for a draft that was actually persisted.
  try {
    const { data, error } = await supabase
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', userId)
      .is('ended_at', null)
      // Skip already-parked sessions: makes this a true no-op on the resume auto-heal path
      // for a post-fix draft (whose session is already soft-deleted) instead of refreshing
      // deleted_at and logging a spurious "soft-deleted" line.
      .is('deleted_at', null)
      .in('mode', PRACTICE_MODES as readonly string[])
      .select('id')
    if (error) {
      console.error('[closePracticeSession] Session close error:', error.message)
      return
    }
    if ((data?.length ?? 0) > 0) {
      console.log('[closePracticeSession] Session', sessionId, 'soft-deleted for user', userId)
    }
  } catch (err) {
    console.error('[closePracticeSession] Uncaught error:', err)
  }
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

/**
 * New-draft path: resolve the caller's organization, then insert. Split out of saveDraft
 * so the Server Action orchestrator stays within the §3 line grace.
 */
export async function insertNewDraftForUser(
  supabase: SupabaseClient,
  input: SaveDraftParsed,
  userId: string,
): Promise<DraftResult> {
  const { data: u, error: userError } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .single<{ organization_id: string }>()
  if (userError) {
    console.error('[saveDraft] Users query error:', userError.message)
    return { success: false, error: 'Failed to look up user' }
  }
  if (!u?.organization_id) return { success: false, error: 'User organization not found' }
  return insertNewDraft(supabase, input, userId, u.organization_id)
}
