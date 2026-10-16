// App-layer integration tier (#925) — loadReportSession.
//
// Exercises the real loadReportSession helper (quiz_sessions ownership + completion read,
// quiz_session_answers count + paged scan) against real Postgres under real RLS.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { seedCompletedSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { loadReportSession } from '@/lib/queries/quiz-report-session'
import { POSTGREST_MAX_ROWS } from '@/lib/supabase-paginate'

// Flag on: the loader runs on the service-role client as student A, so row-level security
// no longer narrows the read and only the loader's own filters can reject a row.
const bypass = vi.hoisted(() => ({ on: false, userId: '' }))

vi.mock('@repo/db/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@repo/db/server')>()
  return {
    ...original,
    // Harness is imported at call time: importing it inside the factory deadlocks the module graph.
    createServerSupabaseClient: async (
      ...args: Parameters<typeof original.createServerSupabaseClient>
    ) => {
      if (!bypass.on) return original.createServerSupabaseClient(...args)
      const { getAdminClient: adminClient } = await import('@/lib/integration-support/harness')
      return adminClient() as unknown as Awaited<
        ReturnType<typeof original.createServerSupabaseClient>
      >
    },
  }
})

vi.mock('@/lib/auth/get-session-user', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth/get-session-user')>()
  return {
    ...original,
    getSessionUser: () =>
      bypass.on ? Promise.resolve({ id: bypass.userId, email: null }) : original.getSessionUser(),
  }
})

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const emailA = `int-qrs-a-${suffix}@test.local`
const emailB = `int-qrs-b-${suffix}@test.local`

// One more than a full page, so the scan must cross a page boundary.
const PAGED_ROW_COUNT = POSTGREST_MAX_ROWS + 5
const PAGED_BASE_MS = Date.UTC(2026, 0, 1, 0, 0, 0)

// Sentinels: vitest runs afterAll after a failed beforeAll.
let orgId = ''
let studentAId = ''
let studentBId = ''
let refs: ReferenceIds | null = null
let questionIds: string[] = []
let dialogQuestionId = ''

let ownedSessionId: string
let foreignSessionId: string
let pagedSessionId: string
let deletedSessionId: string
let activeSessionId: string

type StudentClient = Awaited<ReturnType<typeof getAuthenticatedClient>>

async function startSession(client: StudentClient, ids: string[]): Promise<string> {
  const { data, error } = await client.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: refs?.subjectId ?? null,
    p_topic_id: refs?.topicId ?? null,
    p_question_ids: ids,
  })
  if (error) throw new Error(`start_quiz_session: ${error.message}`)
  if (typeof data !== 'string') throw new Error('start_quiz_session: no session id')
  return data
}

async function insertPagedAnswers(sessionId: string): Promise<void> {
  // Inserted in REVERSE answered_at order so insertion order cannot satisfy the sort.
  const rows = Array.from({ length: PAGED_ROW_COUNT }, (_, i) => ({
    session_id: sessionId,
    question_id: dialogQuestionId,
    blank_index: i,
    response_text: `blank ${i}`,
    is_correct: true,
    response_time_ms: 1000,
    answered_at: new Date(PAGED_BASE_MS + i * 1000).toISOString(),
  })).reverse()
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('quiz_session_answers').insert(rows.slice(i, i + 500))
    if (error) throw new Error(`insert paged answers: ${error.message}`)
  }
}

async function adminEnd(sessionId: string): Promise<void> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select('id')
  if (error) throw new Error(`end session: ${error.message}`)
  if (data?.length !== 1) throw new Error('end session: no row updated')
}

async function adminSoftDelete(sessionId: string): Promise<void> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select('id')
  if (error) throw new Error(`soft-delete session: ${error.message}`)
  if (data?.length !== 1) throw new Error('soft-delete session: no row updated')
}

async function countAnswers(sessionId: string): Promise<number> {
  const { count, error } = await admin
    .from('quiz_session_answers')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (error) throw new Error(`countAnswers: ${error.message}`)
  return count ?? 0
}

async function insertDialogQuestion(bankId: string, adminUserId: string): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs?.subjectId,
      topic_id: refs?.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      question_type: 'dialog_fill',
      question_text: 'Paged dialog',
      dialog_template: '[atc] {{0|cleared}}.',
      blanks_config: [{ index: 0, canonical: 'cleared', synonyms: [] }],
      explanation_text: 'explanation',
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertDialogQuestion: ${error.message}`)
  return (data as { id: string }).id
}

describe('loadReportSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-qrs ${suffix}`, slug: `int-qrs-${suffix}` })
    studentAId = await createTestUser({ admin, orgId, email: emailA, password, role: 'student' })
    studentBId = await createTestUser({ admin, orgId, email: emailB, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `QS_${suffix}`,
      subjectName: `QRS Subject ${suffix}`,
      topicCode: `QS_${suffix}_T1`,
      topicName: `QRS Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds
    dialogQuestionId = await insertDialogQuestion(seeded.bankId, studentAId)

    const clientA = await getAuthenticatedClient({ email: emailA, password })
    const clientB = await getAuthenticatedClient({ email: emailB, password })
    const seedArgs = {
      questionIds,
      correctCount: 2,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    }

    ownedSessionId = (await seedCompletedSession({ studentClient: clientA, ...seedArgs })).sessionId
    foreignSessionId = (await seedCompletedSession({ studentClient: clientB, ...seedArgs }))
      .sessionId
    deletedSessionId = (await seedCompletedSession({ studentClient: clientA, ...seedArgs }))
      .sessionId
    await adminSoftDelete(deletedSessionId)

    pagedSessionId = await startSession(clientA, [dialogQuestionId])
    await insertPagedAnswers(pagedSessionId)
    await adminEnd(pagedSessionId)

    // Last: the single-active-session invariant allows one open session per student.
    activeSessionId = await startSession(clientA, questionIds.slice(0, 1))
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: activeSessionId,
      question_id: questionIds[0],
      selected_option_id: 'b',
      is_correct: true,
      response_time_ms: 1000,
    })
    if (error) throw new Error(`insert active answer: ${error.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({
          admin,
          orgId,
          userIds: [studentAId, studentBId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // FK-ordering gate: reference data parents the questions cleanupTestData removes.
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns the session row and its answer rows ordered by answered_at for the owner', async () => {
    await signInAs(emailA, password)

    const r = await loadReportSession(ownedSessionId)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected ok')
    expect(r.session.id).toBe(ownedSessionId)
    expect(r.session.mode).toBe('quick_quiz')
    expect(r.session.ended_at).not.toBeNull()
    expect(r.session.total_questions).toBe(3)
    expect(r.session.correct_count).toBe(2)
    expect(r.answerRows.map((a) => a.question_id).sort()).toEqual([...questionIds].sort())
    const times = r.answerRows.map((a) => new Date(a.answered_at).getTime())
    expect(times).toEqual([...times].sort((x, y) => x - y))
  })

  it('does not serve another students ended session', async () => {
    // Non-vacuous: the foreign session is ended and has answers.
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, student_id')
      .eq('id', foreignSessionId)
      .single()
    if (error) throw new Error(`foreign session read: ${error.message}`)
    expect(data?.ended_at).not.toBeNull()
    expect(data?.student_id).toBe(studentBId)
    expect(await countAnswers(foreignSessionId)).toBeGreaterThan(0)

    await signInAs(emailA, password)
    const r = await loadReportSession(foreignSessionId)

    expect(r.ok).toBe(false)
  })

  it('rejects another students session even when row-level security would let the read through', async () => {
    // MUTATION: removing .eq('student_id', studentId) from fetchEndedSession turns this red.
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, student_id')
      .eq('id', foreignSessionId)
      .maybeSingle()
    if (error) throw new Error(`foreign session service-role read: ${error.message}`)
    expect(data?.student_id).toBe(studentBId)
    expect(data?.ended_at).not.toBeNull()

    bypass.on = true
    bypass.userId = studentAId
    try {
      const r = await loadReportSession(foreignSessionId)
      expect(r.ok).toBe(false)
    } finally {
      bypass.on = false
      bypass.userId = ''
    }
  })

  it('serves no session or answer rows while the session is still active', async () => {
    // Non-vacuous: the session is active, owned by the caller, and holds an answer row.
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, student_id, deleted_at')
      .eq('id', activeSessionId)
      .single()
    if (error) throw new Error(`active session read: ${error.message}`)
    expect(data?.ended_at).toBeNull()
    expect(data?.deleted_at).toBeNull()
    expect(data?.student_id).toBe(studentAId)
    expect(await countAnswers(activeSessionId)).toBe(1)

    await signInAs(emailA, password)
    const r = await loadReportSession(activeSessionId)

    expect(r.ok).toBe(false)
    expect('answerRows' in r).toBe(false)
  })

  it('does not serve a soft-deleted session', async () => {
    // Non-vacuous: the row exists, is ended, owned by the caller, and soft-deleted.
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, student_id, deleted_at')
      .eq('id', deletedSessionId)
      .single()
    if (error) throw new Error(`deleted session read: ${error.message}`)
    expect(data?.ended_at).not.toBeNull()
    expect(data?.deleted_at).not.toBeNull()
    expect(data?.student_id).toBe(studentAId)

    await signInAs(emailA, password)
    const r = await loadReportSession(deletedSessionId)

    expect(r.ok).toBe(false)
  })

  it('returns every answer row of a session larger than one page, in answered_at order', async () => {
    expect(await countAnswers(pagedSessionId)).toBe(PAGED_ROW_COUNT)

    await signInAs(emailA, password)
    const r = await loadReportSession(pagedSessionId)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected ok')
    expect(r.answerRows).toHaveLength(PAGED_ROW_COUNT)
    const expected = Array.from({ length: PAGED_ROW_COUNT }, (_, i) => PAGED_BASE_MS + i * 1000)
    expect(r.answerRows.map((a) => new Date(a.answered_at).getTime())).toEqual(expected)
  })
})
