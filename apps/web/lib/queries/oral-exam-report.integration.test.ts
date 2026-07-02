// App-layer integration tier (#925) — the getOralExamReport query helper vs the
// real get_oral_exam_report RPC against real Postgres.
//
// Drives a practice oral exam (1 section) to 'graded' via
// start_oral_exam_session → submit_oral_section_response → then grades it with
// write_oral_section_grade through the service-role admin client — the grader is
// REVOKEd from `authenticated` (packages/db/src/__integration__/rpc-oral-exam-grade.integration.test.ts
// is the crown-jewel forgery-guard test for that RPC; this file exercises the
// app-layer read path on top of an already-graded session).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { getOralExamReport } from './oral-exam-report'

const admin = getAdminClient()
const suffix = Date.now()

const DESCRIPTORS = [
  'pronunciation',
  'structure',
  'vocabulary',
  'fluency',
  'comprehension',
  'interaction',
] as const

function sixScores(level: number) {
  return DESCRIPTORS.map((descriptor) => ({
    descriptor,
    level,
    rationale: `evidence for ${descriptor}`,
  }))
}

let orgId: string
let studentId: string
let otherStudentId: string
const email = `int-oral-report-${suffix}@test.local`
const password = 'test-pass-123'
const otherEmail = `int-oral-report-other-${suffix}@test.local`
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

/** Drives a fresh practice session (1 section) to 'graded' for the given student. */
async function gradeAPracticeSession(opts: {
  studentEmail: string
  studentPassword: string
  studentDbId: string
}): Promise<string> {
  const client = await getAuthenticatedClient({
    email: opts.studentEmail,
    password: opts.studentPassword,
  })
  const { data: startData, error: startErr } = await client.rpc('start_oral_exam_session', {
    p_mode: 'practice',
  })
  if (startErr) throw new Error(`start_oral_exam_session: ${startErr.message}`)
  const sessionId = extractSessionId(startData)

  const audioPath = `${orgId}/${opts.studentDbId}/${sessionId}/1.webm`
  const { data: responseId, error: submitErr } = await client.rpc('submit_oral_section_response', {
    p_session_id: sessionId,
    p_section_no: 1,
    p_audio_path: audioPath,
    p_duration_ms: 5000,
  })
  if (submitErr) throw new Error(`submit_oral_section_response: ${submitErr.message}`)
  if (typeof responseId !== 'string') {
    throw new TypeError('submit_oral_section_response returned a non-string response id')
  }

  const { error: gradeErr } = await admin.rpc('write_oral_section_grade', {
    p_response_id: responseId,
    p_transcript: 'integration test transcript',
    p_transcript_meta: null,
    p_descriptor_scores: sixScores(4),
    p_usage: [],
  })
  if (gradeErr) throw new Error(`write_oral_section_grade: ${gradeErr.message}`)

  return sessionId
}

describe('getOralExamReport (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-oral-report ${suffix}`,
      slug: `int-oral-report-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: otherEmail,
      password: otherPassword,
      role: 'student',
    })
  })

  // uq_one_active_oral_exam_per_student — clear any leftover ACTIVE session so the
  // next test's start call gets a fresh session. Graded sessions have ended_at set
  // and are left alone (mirrors oral-exam-session.integration.test.ts).
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

  it('returns the graded report shape for the caller-owned session', async () => {
    const sessionId = await gradeAPracticeSession({
      studentEmail: email,
      studentPassword: password,
      studentDbId: studentId,
    })

    await signInAs(email, password)
    const report = await getOralExamReport(sessionId)

    expect(report).not.toBeNull()
    expect(report?.sessionId).toBe(sessionId)
    expect(report?.status).toBe('graded')
    expect(report?.totalFinalLevel).toBe(4)
    expect(report?.descriptors).toHaveLength(6)
    expect(report?.sections).toHaveLength(1)
    expect(report?.sections[0]?.sectionNo).toBe(1)
    expect(report?.sections[0]?.scores).toHaveLength(6)
  })

  it("does not return another student's graded session (ownership gate)", async () => {
    const otherSessionId = await gradeAPracticeSession({
      studentEmail: otherEmail,
      studentPassword: otherPassword,
      studentDbId: otherStudentId,
    })

    // Non-vacuous: the other student's session genuinely exists and is graded,
    // verified via the service-role client, before asserting the caller can't
    // read it (code-style.md §7 — negative assertions must be reachable).
    const { data: otherRow, error: otherReadErr } = await admin
      .from('oral_exam_sessions')
      .select('id, status')
      .eq('id', otherSessionId)
      .single()
    if (otherReadErr) throw new Error(otherReadErr.message)
    expect(otherRow?.status).toBe('graded')

    await signInAs(email, password)
    const report = await getOralExamReport(otherSessionId)

    expect(report).toBeNull()
  })
})
