/**
 * Red Team Spec: single-active-session invariant (Vectors EP, EQ, ER, ES, ET; #1011)
 *
 * #1011 closes the Discovery/exam answer-key oracle by making it impossible for a
 * student to hold MORE THAN ONE active (ended_at IS NULL AND deleted_at IS NULL)
 * quiz_sessions row across ALL modes. Discovery (which reveals MC answer keys via
 * get_study_questions) and an exam graded from the SAME org MC pool may never run
 * concurrently. Enforcement is two-layered:
 *   - The start RPCs (migs 138–141) auto-soft-delete an abandoned discovery row,
 *     then RAISE 'another_session_active' on any OTHER active session they won't
 *     themselves resume (self-exclusion preserves same-subject exam resume tokens).
 *   - start_discovery_session (mig 137) is the new ephemeral-session RPC, with the
 *     same single-active guard.
 *   - The partial unique index uq_one_active_session_per_student (mig 136) is the
 *     concurrency-safe backstop.
 *
 * Vectors (each NON-VACUOUS — the protected/blocking state is asserted to exist
 * before the block is asserted, and positive controls run first):
 *   - EP practice-blocked-by-exam: a student with an active mock_exam cannot start
 *     a practice quiz (start_quiz_session → another_session_active). Positive
 *     control: with NO active session, start_quiz_session succeeds.
 *   - EQ exam-blocked-by-practice: a student with an active quick_quiz cannot start
 *     an exam (start_exam_session → another_session_active). The global guard fires
 *     before the same-subject guard because the modes differ.
 *   - ER discovery auto-clear on exam start (THE #1011 FIX): a student with an
 *     active discovery row that starts an exam SUCCEEDS, and the discovery row is
 *     auto-soft-deleted — they can never hold discovery + exam concurrently.
 *   - ES start_discovery_session guard suite: unauthenticated → rejected; active
 *     exam → another_session_active; happy path creates exactly ONE active discovery
 *     row; a repeat start replaces it (still exactly one).
 *   - ET the global unique index physically blocks a direct service-role INSERT of a
 *     SECOND active session for the same student (23505 /
 *     uq_one_active_session_per_student).
 *
 * Hermeticity (code-style.md §7): the redteam Playwright project runs serially
 * (workers: 1, fullyParallel: false), so the shared egmont victim student is reused
 * safely. Every test seeds at most ONE active session per student at a time (the
 * global unique index forbids two), and a beforeEach + afterEach soft-delete EVERY
 * active session the victim holds — covering both spec-created rows and any leaked
 * by a prior spec, so a "no active session" positive control can never fail
 * spuriously. quiz_sessions is soft-delete-only (docs/database.md matrix). Single
 * cleanup step → no §7 per-step accumulator needed. egmont scaffolding
 * (subject/topic/questions/exam_config) is create-or-reuse idempotent infrastructure,
 * not torn down.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import { seedRedTeamStudent, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!SUPABASE_URL) {
  throw new Error(
    'single-active-session.spec: NEXT_PUBLIC_SUPABASE_URL is required (set it in apps/web/.env.local)',
  )
}
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!ANON_KEY) {
  throw new Error(
    'single-active-session.spec: NEXT_PUBLIC_SUPABASE_ANON_KEY is required (set it in apps/web/.env.local)',
  )
}

type ActiveSessionRow = {
  id: string
  mode: string
  deleted_at: string | null
  ended_at: string | null
}

// §5 cast-guards: DB/RPC results are `unknown`-shaped at runtime — guard fields
// before treating a Supabase row as the typed shape, so a null/shape regression
// fails as a clean assertion instead of an opaque TypeError.
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isActiveSessionRow = (v: unknown): v is ActiveSessionRow =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.mode === 'string' &&
  (typeof v.deleted_at === 'string' || v.deleted_at === null) &&
  (typeof v.ended_at === 'string' || v.ended_at === null)

test.describe('Red Team: single-active-session invariant (Vectors EP/EQ/ER/ES/ET)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let victimUserId: string
  let subjectId: string
  let topicId: string
  let questionIds: string[]

  // Soft-delete every active session the victim currently holds. Used by
  // beforeEach (clean slate before each test) AND afterEach (no leak into the
  // next spec). Single step — no §7 accumulator needed.
  const clearActiveSessions = async (): Promise<void> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', victimUserId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`clearActiveSessions: ${error.message}`)
    if (!Array.isArray(data)) throw new Error('clearActiveSessions: unexpected response shape')
    if (data.length > 0) {
      console.info(`[single-active-session] cleared ${data.length} active session(s)`)
    }
  }

  // Read the victim's active (ended_at IS NULL AND deleted_at IS NULL) sessions.
  const readActiveSessions = async (): Promise<ActiveSessionRow[]> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, mode, deleted_at, ended_at')
      .eq('student_id', victimUserId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`readActiveSessions: ${error.message}`)
    if (!Array.isArray(data)) throw new Error('readActiveSessions: unexpected response shape')
    if (!data.every(isActiveSessionRow)) throw new Error('readActiveSessions: unexpected row shape')
    return data
  }

  // Insert an active session of `mode` directly (service-role bypasses RLS, not the
  // partial unique index). Returns the id.
  const seedActiveSession = async (mode: string): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: victimUserId, mode, subject_id: subjectId })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seedActiveSession(${mode}): ${error?.message}`)
    if (!isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedActiveSession(${mode}): unexpected insert response shape`)
    return data.id
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamStudent()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    studentClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    // ≥2 active questions so the repeat-discovery-start (idempotent replace) test
    // can replay with a DISTINCT question set (slice(0, 2)) — code-style.md §7:
    // idempotent/re-read paths must seed ≥2 distinct fixture values.
    const picked = await pickSubjectWithQuestions(admin, {
      orgId,
      minActiveQuestions: 2,
      topicMinQuestions: 2,
    })
    subjectId = picked.subjectId
    topicId = picked.topicId

    // Real active question ids for the practice / discovery positive controls.
    const { data: qs, error: qsErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(2)
    if (qsErr) throw new Error(`beforeAll questions: ${qsErr.message}`)
    if (!Array.isArray(qs) || qs.length < 2)
      throw new Error('beforeAll: need at least two active egmont questions to seed from')
    if (!qs.every((q): q is { id: string } => isRecord(q) && typeof q.id === 'string'))
      throw new Error('beforeAll: unexpected question row shape')
    questionIds = qs.map((q) => q.id)

    // Ensure an enabled exam_config + distribution so start_exam_session can reach
    // its INSERT (rather than fail on config lookup) for EP/EQ/ER.
    await ensureExamConfig(orgId, subjectId, topicId)
  })

  test.beforeEach(async () => {
    await clearActiveSessions()
  })

  test.afterEach(async () => {
    await clearActiveSessions()
  })

  // start_exam_session can still fail if the picked subject's existing exam_config
  // demands more questions than the fixture has — that is a seed concern, not the
  // single-active behavior. Mirrors session-race-condition.spec.ts.
  const isExamSeedGap = (message: string): boolean =>
    /no exam configuration/i.test(message) ||
    /not enough active questions/i.test(message) ||
    /distribution total/i.test(message)

  test('EP: a practice quiz is blocked while a mock_exam is active, but starts when no session is active', async () => {
    // Positive control FIRST (non-vacuity): with NO active session, a practice
    // start succeeds — so the later block proves the guard, not a broken RPC.
    const ok = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(ok.error).toBeNull()
    expect(typeof ok.data).toBe('string')
    const practiceSessionId = ok.data as string
    const activeAfterStart = await readActiveSessions()
    expect(activeAfterStart.map((s) => s.id)).toEqual([practiceSessionId])
    expect(activeAfterStart.map((s) => s.mode)).toEqual(['quick_quiz'])

    // Reset to a clean slate, then seed an active mock_exam.
    await clearActiveSessions()
    const examId = await seedActiveSession('mock_exam')
    // Non-vacuity: the blocking exam session genuinely exists and is active.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([examId])

    const blocked = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(blocked.error).not.toBeNull()
    expect(blocked.error?.message ?? '').toMatch(/another_session_active/i)
    expect(blocked.data).toBeNull()

    // No practice row was created — the exam remains the only active session.
    const active = await readActiveSessions()
    expect(active.map((s) => s.id)).toEqual([examId])
    expect(active.map((s) => s.mode)).not.toContain('quick_quiz')
  })

  test('EQ: an exam is blocked while a practice session is active (cross-mode global guard)', async () => {
    const quizId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the blocking practice session genuinely exists and is active.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([quizId])

    const blocked = await studentClient.rpc('start_exam_session', { p_subject_id: subjectId })
    expect(blocked.error).not.toBeNull()
    // The global guard (different mode → not self-excluded) fires before the
    // same-subject 'already in progress' guard.
    expect(blocked.error?.message ?? '').toMatch(/another_session_active/i)
    expect(blocked.data).toBeNull()

    // No exam row was created — the practice session remains the only active one.
    const active = await readActiveSessions()
    expect(active.map((s) => s.id)).toEqual([quizId])
    expect(active.map((s) => s.mode)).not.toContain('mock_exam')
  })

  test('ER: starting an exam auto-soft-deletes an abandoned discovery row and creates the exam session', async () => {
    const discoveryId = await seedActiveSession('discovery')
    // Non-vacuity: the discovery row is genuinely active before the exam start.
    const before = await readActiveSessions()
    expect(before.map((s) => s.id)).toEqual([discoveryId])
    expect(before[0]?.mode).toBe('discovery')

    const started = await studentClient.rpc('start_exam_session', { p_subject_id: subjectId })
    if (started.error && isExamSeedGap(started.error.message)) {
      test.skip(
        true,
        'insufficient exam config / question distribution in fixture — covered by the integration tier',
      )
      return
    }
    expect(started.error).toBeNull()
    // §5 cast-guard: verify the RPC payload shape before reading session_id.
    expect(started.data).not.toBeNull()
    expect(typeof started.data).toBe('object')
    expect(started.data).toHaveProperty('session_id')
    const startedData = started.data as unknown as { session_id?: string }
    const examSessionId = startedData.session_id
    expect(typeof examSessionId).toBe('string')

    // THE #1011 FIX: the discovery row is now soft-deleted (deleted_at set), NOT
    // ended (ended_at still null), so a discovery + exam pair can never coexist.
    const { data: discRow, error: discErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', discoveryId)
      .single()
    expect(discErr).toBeNull()
    expect(discRow?.deleted_at).not.toBeNull()
    expect(discRow?.ended_at).toBeNull()

    // The new mock_exam is the only active session.
    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(examSessionId)
    expect(active[0]?.mode).toBe('mock_exam')
  })

  test('ES: an unauthenticated discovery start is rejected (not_authenticated)', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  test('ES: a discovery start is blocked while an exam session is active (another_session_active)', async () => {
    const examId = await seedActiveSession('mock_exam')
    // Non-vacuity: the blocking exam session genuinely exists and is active.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([examId])

    const { data, error } = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/another_session_active/i)
    expect(data).toBeNull()

    // No discovery row was created.
    const active = await readActiveSessions()
    expect(active.map((s) => s.id)).toEqual([examId])
    expect(active.map((s) => s.mode)).not.toContain('discovery')
  })

  test('ES: a discovery start creates exactly one active discovery session, and a repeat start replaces it', async () => {
    const first = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(first.error).toBeNull()
    expect(typeof first.data).toBe('string')
    const firstId = first.data as string
    // Exactly one active discovery row (non-vacuity: the happy path genuinely created it).
    const afterFirst = await readActiveSessions()
    expect(afterFirst.map((s) => s.id)).toEqual([firstId])
    expect(afterFirst[0]?.mode).toBe('discovery')

    const second = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(second.error).toBeNull()
    // §5 cast-guard: verify the RPC returned a string id before reading it.
    expect(typeof second.data).toBe('string')
    const secondId = second.data as string

    // Still exactly one active discovery row — the second; the first is soft-deleted.
    const afterSecond = await readActiveSessions()
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond[0]?.id).toBe(secondId)
    expect(secondId).not.toBe(firstId)

    const { data: firstRow, error: firstRowErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at')
      .eq('id', firstId)
      .single()
    expect(firstRowErr).toBeNull()
    expect(firstRow?.deleted_at).not.toBeNull()

    // §7 idempotency: the replacement session persists the DISTINCT input question
    // set (slice(0, 2)), not a hardcoded or first-start set — so a regression that
    // ignores the repeat's question_ids fails here.
    const { data: secondRow, error: secondRowErr } = await admin
      .from('quiz_sessions')
      .select('config')
      .eq('id', secondId)
      .single()
    expect(secondRowErr).toBeNull()
    expect(isRecord(secondRow) && isRecord(secondRow.config)).toBe(true)
    const secondConfig = (secondRow as { config: Record<string, unknown> }).config
    expect(secondConfig.question_ids).toEqual(questionIds.slice(0, 2))
  })

  test('ET: the global unique index blocks a direct second active session insert (23505)', async () => {
    const firstId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the first active session exists.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([firstId])

    // A second active session for the SAME student violates
    // uq_one_active_session_per_student even via the service role — the partial
    // unique index is a hard schema constraint, not an RLS policy.
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'mock_exam',
        subject_id: subjectId,
      })
      .select('id')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
    expect(error?.message ?? '').toMatch(/uq_one_active_session_per_student/i)

    // No-op assertion (red-team no-op rule): the blocked insert changed nothing —
    // the original quick_quiz session is still the only active session.
    const active = await readActiveSessions()
    expect(active.map((s) => s.id)).toEqual([firstId])
    expect(active.map((s) => s.mode)).toEqual(['quick_quiz'])
  })
})
