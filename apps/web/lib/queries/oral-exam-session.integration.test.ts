// App-layer integration tier (#925) — real query helpers vs real Postgres under real RLS.
//
// Covers getActiveOralExamSession + getOralExamSession: mapping of the JSONB
// `config` column (mode/sections) and the embedded oral_exam_section_responses
// FK-hint select, plus non-vacuous cross-student isolation (§7).
//
// Oral exam rows have NO direct INSERT policy for students (RLS-BYPASS MODEL,
// mig 150 header) — they can only be created via the SECURITY DEFINER RPCs, so
// fixtures here are seeded by calling start_oral_exam_session /
// submit_oral_section_response through an authenticated (non-admin) client,
// mirroring the existing fixtures.ts pattern for quiz_sessions.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { getActiveOralExamSession, getOralExamSession } from './oral-exam-session'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentId: string
let otherStudentId: string
const email = `int-oral-${suffix}@test.local`
const password = 'test-pass-123'
const otherEmail = `int-oral-other-${suffix}@test.local`
const otherPassword = 'test-pass-123'

/** Runtime-guard the jsonb scalar RPC reply before treating it as { session_id }. */
function extractSessionId(data: unknown): string {
  if (typeof data !== 'object' || data === null || !('session_id' in data)) {
    throw new TypeError('start_oral_exam_session returned an unexpected payload shape')
  }
  const sessionId = (data as { session_id: unknown }).session_id
  if (typeof sessionId !== 'string') {
    throw new TypeError('start_oral_exam_session returned a non-string session_id')
  }
  return sessionId
}

describe('oral exam session queries (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-oral ${suffix}`, slug: `int-oral-${suffix}` })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: otherEmail,
      password: otherPassword,
      role: 'student',
    })
  })

  // uq_one_active_oral_exam_per_student means a leftover active session from one
  // test would be silently resumed (not error) by the next test's start call —
  // clear it explicitly so each test starts from a clean slate.
  afterEach(async () => {
    const { data: cleaned, error } = await admin
      .from('oral_exam_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .in('student_id', [studentId, otherStudentId])
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach cleanup: ${error.message}`)
    if ((cleaned?.length ?? 0) > 0) {
      console.log(`[afterEach] discarded ${cleaned?.length} oral session(s)`)
    }
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds: [studentId, otherStudentId] })
  })

  it('returns null when the caller has no active oral exam session', async () => {
    await signInAs(email, password)

    const result = await getActiveOralExamSession()

    expect(result).toBeNull()
  })

  it("returns the caller's active session with mapped mode and sections", async () => {
    const studentClient = await getAuthenticatedClient({ email, password })
    const { data, error } = await studentClient.rpc('start_oral_exam_session', {
      p_mode: 'practice',
    })
    if (error) throw new Error(`start_oral_exam_session: ${error.message}`)
    const sessionId = extractSessionId(data)

    await signInAs(email, password)
    const result = await getActiveOralExamSession()

    expect(result).not.toBeNull()
    expect(result?.id).toBe(sessionId)
    expect(result?.status).toBe('in_progress')
    expect(result?.mode).toBe('practice')
    expect(result?.sections).toEqual([{ sectionNo: 1, type: 'interview' }])
  })

  it("does not return another student's active session", async () => {
    const otherClient = await getAuthenticatedClient({ email: otherEmail, password: otherPassword })
    const { error: otherStartErr } = await otherClient.rpc('start_oral_exam_session', {
      p_mode: 'mock',
    })
    if (otherStartErr) throw new Error(`start_oral_exam_session (other): ${otherStartErr.message}`)

    // Non-vacuous: confirm the other student's active session genuinely exists
    // (via the service-role client, bypassing RLS) before asserting the caller
    // does not see it — otherwise a null result proves nothing (code-style §7).
    const { data: otherRows, error: otherReadErr } = await admin
      .from('oral_exam_sessions')
      .select('id')
      .eq('student_id', otherStudentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (otherReadErr) throw new Error(otherReadErr.message)
    expect(otherRows?.length ?? 0).toBeGreaterThan(0)

    await signInAs(email, password)
    const result = await getActiveOralExamSession()

    expect(result).toBeNull()
  })

  it('returns a session by id including its section responses', async () => {
    const studentClient = await getAuthenticatedClient({ email, password })
    const { data, error } = await studentClient.rpc('start_oral_exam_session', {
      p_mode: 'practice',
    })
    if (error) throw new Error(`start_oral_exam_session: ${error.message}`)
    const sessionId = extractSessionId(data)

    const audioPath = `${orgId}/${studentId}/${sessionId}/1.webm`
    const { error: submitErr } = await studentClient.rpc('submit_oral_section_response', {
      p_session_id: sessionId,
      p_section_no: 1,
      p_audio_path: audioPath,
      p_duration_ms: 5000,
    })
    if (submitErr) throw new Error(`submit_oral_section_response: ${submitErr.message}`)

    await signInAs(email, password)
    const result = await getOralExamSession(sessionId)

    expect(result).not.toBeNull()
    expect(result?.id).toBe(sessionId)
    expect(result?.mode).toBe('practice')
    expect(result?.responses).toEqual([{ sectionNo: 1, status: 'grading' }])
  })

  it('returns a session even after it has ended (ended_at is not filtered)', async () => {
    const studentClient = await getAuthenticatedClient({ email, password })
    const { data, error } = await studentClient.rpc('start_oral_exam_session', {
      p_mode: 'practice',
    })
    if (error) throw new Error(`start_oral_exam_session: ${error.message}`)
    const sessionId = extractSessionId(data)

    const { data: ended, error: endErr } = await admin
      .from('oral_exam_sessions')
      .update({ status: 'graded', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select('id')
    if (endErr) throw new Error(`admin end session: ${endErr.message}`)
    if (!ended?.length) throw new Error('admin end session: no row matched')

    await signInAs(email, password)
    const result = await getOralExamSession(sessionId)

    expect(result).not.toBeNull()
    expect(result?.status).toBe('graded')
  })

  it("does not return another student's session by id (RLS ownership)", async () => {
    const otherClient = await getAuthenticatedClient({ email: otherEmail, password: otherPassword })
    const { data: otherData, error: otherErr } = await otherClient.rpc('start_oral_exam_session', {
      p_mode: 'practice',
    })
    if (otherErr) throw new Error(`start_oral_exam_session (other): ${otherErr.message}`)
    const otherSessionId = extractSessionId(otherData)

    await signInAs(email, password)
    const result = await getOralExamSession(otherSessionId)

    expect(result).toBeNull()
  })

  it('returns null when the session id does not exist', async () => {
    await signInAs(email, password)

    const result = await getOralExamSession('00000000-0000-4000-a000-000000000000')

    expect(result).toBeNull()
  })
})
