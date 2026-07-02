import { getAdminClient } from '../../helpers/supabase'
import { seedRedTeamStudent } from './seed-users'

// Sentinel value stamped on every response row this seeder inserts.
// Allows the idempotency guard to count only rows created by this helper.
const SENTINEL_RESPONSE_TIME_MS = 987654

export type VictimResponseFixture = {
  victimUserId: string
  correctCount: number
  subjectIds: string[]
  questionIds: string[]
  expected: { current: 3; best: 5 }
}

/**
 * Inserts a deterministic, idempotent set of 8 student_responses for the egmont victim.
 *
 * Design notes:
 *
 * (i) Append-only table: student_responses is immutable (docs/security.md §6 — never
 *   UPDATE or DELETE). Rows are inserted once and left permanently, mirroring the
 *   persistent seed users. No afterEach/afterAll cleanup is needed or correct.
 *
 * (ii) is_correct is what the RPC trusts: get_student_mastery_stats reads sr.is_correct
 *   directly. selected_option_id: 'a' is cosmetic — do not "fix" it to the question's
 *   real correct option.
 *
 * (iii) Duplicate-tolerance: a partial prior run (1–7 sentinel rows) cannot be undone
 *   (append-only), so a re-run inserts a fresh 8. Duplicates are harmless because every
 *   consuming RPC collapses them: streak uses SELECT DISTINCT dates, mastery uses
 *   COUNT(DISTINCT question_id), last-practiced is MAX(created_at) GROUP BY subject_id.
 *   The UNIQUE(session_id, question_id) constraint stays inert because session_id IS NULL
 *   (Postgres treats NULLs as distinct).
 *
 * (iv) The 3-day gap between runs (offsets -3/-4/-5 are absent) must stay >=2 days to
 *   keep the current run (today/-1/-2 → length 3) and the best run (-6..-10 → length 5)
 *   disjoint under the function's run_end >= today-1 anchor.
 */
export async function seedVictimResponses(): Promise<VictimResponseFixture> {
  const { victimUserId, orgId } = await seedRedTeamStudent()
  const admin = getAdminClient()

  // Idempotency guard: if a complete prior seed already exists, skip the insert
  // and re-derive the fixture from those rows. Use >= 8 (not === 8): a partial
  // prior run leaves 1-7 rows, but once a full run lands the count is 8+, and a
  // strict === 8 would let any over-count (e.g. partial-then-full = 9-15) fall
  // through and insert AGAIN, accumulating unboundedly. Duplicates are otherwise
  // harmless (see the duplicate-tolerance note above), so >= 8 short-circuits
  // correctly on any complete-or-over-complete prior seed.
  const { count, error: countError } = await admin
    .from('student_responses')
    .select('id', { head: true, count: 'exact' })
    .eq('student_id', victimUserId)
    .eq('response_time_ms', SENTINEL_RESPONSE_TIME_MS)
  if (countError) throw new Error(`seedVictimResponses count: ${countError.message}`)

  if ((count ?? 0) >= 8) {
    // Re-derive fixture from the existing sentinel rows.
    const { data: existingRows, error: rowsError } = await admin
      .from('student_responses')
      .select('question_id')
      .eq('student_id', victimUserId)
      .eq('response_time_ms', SENTINEL_RESPONSE_TIME_MS)
    if (rowsError) throw new Error(`seedVictimResponses re-derive rows: ${rowsError.message}`)

    const questionIds = (existingRows ?? []).map((r) => r.question_id as string)
    const uniqueQuestionIds = [...new Set(questionIds)]

    const { data: questionRows, error: qError } = await admin
      .from('questions')
      .select('id, subject_id')
      .in('id', uniqueQuestionIds)
    if (qError) throw new Error(`seedVictimResponses re-derive questions: ${qError.message}`)

    const subjectIds = [...new Set((questionRows ?? []).map((q) => q.subject_id as string))]

    return {
      victimUserId,
      // Distinct questions the mastery RPC will count as correct (COUNT(DISTINCT
      // question_id)) — not the raw row count, which round-robin may repeat.
      correctCount: uniqueQuestionIds.length,
      subjectIds,
      questionIds,
      expected: { current: 3, best: 5 },
    }
  }

  // Select up to 8 active, non-deleted egmont questions (deterministic order).
  // Restrict to multiple_choice: the rows below are MC-shaped (selected_option_id,
  // no blank_index), and the blank_index⇔dialog_fill trigger (mig 131, #828) would
  // reject a dialog_fill question inserted with a NULL blank_index. Today egmont seeds
  // MC-only, but this keeps the helper correct if dialog_fill is ever added there.
  const { data: questions, error: questionsError } = await admin
    .from('questions')
    .select('id, subject_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .eq('question_type', 'multiple_choice')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(8)
  if (questionsError) throw new Error(`seedVictimResponses questions: ${questionsError.message}`)
  if (!questions || questions.length === 0) {
    throw new Error('seedVictimResponses: need >=1 active egmont question, found 0')
  }

  // Build 8 timestamps from a single snapshot — noon UTC, one per offset day.
  // Using a single `now` prevents a UTC-midnight rollover mid-seed from splitting a run.
  const now = new Date()
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
  const offsets = [0, 1, 2, 6, 7, 8, 9, 10] // current run: today/-1/-2; best run: -6..-10

  // Build 8 rows — one per date — assigning questions round-robin over the available set.
  const rows = offsets.map((offset, i) => {
    const question = questions[i % questions.length]
    return {
      organization_id: orgId,
      student_id: victimUserId,
      question_id: question.id,
      selected_option_id: 'a',
      is_correct: true,
      response_time_ms: SENTINEL_RESPONSE_TIME_MS,
      session_id: null,
      created_at: new Date(base - offset * 86_400_000).toISOString(),
    }
  })

  const { error: insertError } = await admin.from('student_responses').insert(rows)
  if (insertError) throw new Error(`seedVictimResponses insert: ${insertError.message}`)

  const questionIds = rows.map((r) => r.question_id)
  const subjectIds = [...new Set(questions.map((q) => q.subject_id as string))]

  return {
    victimUserId,
    // Distinct questions the mastery RPC will count as correct (COUNT(DISTINCT
    // question_id)) — not the raw row count, which round-robin may repeat.
    correctCount: new Set(questionIds).size,
    subjectIds,
    questionIds,
    expected: { current: 3, best: 5 },
  }
}
