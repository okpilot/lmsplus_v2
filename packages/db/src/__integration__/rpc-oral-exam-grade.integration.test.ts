import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { sixScores } from './oral-exam-fixtures'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// AI ICAO ELP oral-exam RPCs (migs 150–152) against the real local Postgres.
// The crown-jewel test is the score-forgery regression: write_oral_section_grade
// is REVOKEd from `authenticated`, so a student cannot POST forged scores — the
// grader is callable only by the service-role Edge Function. Mocked clients can't
// see the grant model, the partial unique indexes, or the ON CONFLICT inference,
// so these must run against real Postgres.

type ReportShape = {
  status: string
  total_final_level: number | null
  ended_at: string | null
  descriptors: Array<{ descriptor: string; level: number }>
  sections: Array<{ section_no: number; status: string }>
}

describe('RPC: ELP oral exam — grader forgery guard, lifecycle, idempotency', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let student: SupabaseClient
  let otherStudentId: string
  let other: SupabaseClient
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `ELP Org ${suffix}`, slug: `elp-${suffix}` })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `elp-admin-${suffix}@test.local`,
      password: 'pw',
      role: 'admin',
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: `elp-stud-${suffix}@test.local`,
      password: 'pw',
      role: 'student',
    })
    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: `elp-other-${suffix}@test.local`,
      password: 'pw',
      role: 'student',
    })
    userIds.push(adminUserId, studentId, otherStudentId)
    student = await getAuthenticatedClient({
      email: `elp-stud-${suffix}@test.local`,
      password: 'pw',
    })
    other = await getAuthenticatedClient({
      email: `elp-other-${suffix}@test.local`,
      password: 'pw',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  // Each test starts from a clean slate: soft-delete any active oral session for the
  // reused students so the single-active unique index does not block a fresh start.
  beforeEach(async () => {
    const { error } = await admin
      .from('oral_exam_sessions')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'discarded',
        ended_at: new Date().toISOString(),
      })
      .in('student_id', [studentId, otherStudentId])
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`clearActiveOral: ${error.message}`)
  })

  async function startAndSubmitAll(
    client: SupabaseClient,
  ): Promise<{ sessionId: string; responseIds: string[] }> {
    const { data: startData, error: startErr } = await client.rpc('start_oral_exam_session')
    if (startErr) throw new Error(`start: ${startErr.message}`)
    const start = requireRpcResult<{ session_id: string }>(startData, 'start_oral_exam_session')
    const sessionId = start.session_id
    const responseIds: string[] = []
    for (let n = 1; n <= 5; n++) {
      const { data, error } = await client.rpc('submit_oral_section_response', {
        p_session_id: sessionId,
        p_section_no: n,
        p_audio_path: `${orgId}/${studentId}/${sessionId}/${n}.webm`,
        p_duration_ms: 12000,
      })
      if (error) throw new Error(`submit ${n}: ${error.message}`)
      if (typeof data !== 'string') {
        throw new Error(`submit ${n}: expected a response id string, got ${typeof data}`)
      }
      responseIds.push(data)
    }
    return { sessionId, responseIds }
  }

  it('rejects a student calling the grader directly with forged scores', async () => {
    const { sessionId, responseIds } = await startAndSubmitAll(student)

    // Non-vacuous precondition: the section genuinely exists in 'grading'.
    const { data: before, error: beforeErr } = await admin
      .from('oral_exam_section_responses')
      .select('status')
      .eq('id', responseIds[0])
      .single()
    if (beforeErr) throw new Error(`before: ${beforeErr.message}`)
    expect(before?.status).toBe('grading')

    // The attack: an authenticated student POSTs forged all-6 scores to the grader.
    const { error } = await student.rpc('write_oral_section_grade', {
      p_response_id: responseIds[0],
      p_transcript: 'forged',
      p_transcript_meta: null,
      p_descriptor_scores: sixScores(6),
      p_usage: [],
    })
    // REVOKEd from authenticated → PostgREST denies it with a permission-denied
    // error. Assert the exact code (not just non-null) so a silently-restored
    // grant or a signature drift can't mask a regression here.
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')

    // And the state is unchanged: still 'grading', no scores written.
    const { data: after, error: afterErr } = await admin
      .from('oral_exam_section_responses')
      .select('status')
      .eq('id', responseIds[0])
      .single()
    if (afterErr) throw new Error(`after: ${afterErr.message}`)
    expect(after?.status).toBe('grading')
    const { data: scoreRows, error: scoreRowsErr } = await admin
      .from('oral_exam_descriptor_scores')
      .select('id')
      .eq('session_id', sessionId)
    if (scoreRowsErr) throw new Error(`scoreRows: ${scoreRowsErr.message}`)
    expect(scoreRows ?? []).toHaveLength(0)
  })

  it('grades all sections and finalizes at the weakest-link minimum', async () => {
    const { sessionId, responseIds } = await startAndSubmitAll(student)

    for (let i = 0; i < responseIds.length; i++) {
      // Section 3 gets fluency=3; every other descriptor everywhere is 4 → final = 3.
      const scores = i === 2 ? sixScores(4, { fluency: 3 }) : sixScores(4)
      const { error } = await admin.rpc('write_oral_section_grade', {
        p_response_id: responseIds[i],
        p_transcript: `section ${i + 1}`,
        p_transcript_meta: { words: [] },
        p_descriptor_scores: scores,
        p_usage: [
          {
            event_type: 'stt_seconds',
            quantity: 12,
            provider: 'elevenlabs',
            cost_estimate_micros: null,
          },
        ],
      })
      if (error) throw new Error(`grade ${i}: ${error.message}`)
    }

    const { data: sessionRow, error: sessionRowErr } = await admin
      .from('oral_exam_sessions')
      .select('status, total_final_level, ended_at')
      .eq('id', sessionId)
      .single()
    if (sessionRowErr) throw new Error(`sessionRow: ${sessionRowErr.message}`)
    expect(sessionRow?.status).toBe('graded')
    expect(sessionRow?.total_final_level).toBe(3)
    expect(sessionRow?.ended_at).not.toBeNull()

    const { data: reportData, error: reportErr } = await student.rpc('get_oral_exam_report', {
      p_session_id: sessionId,
    })
    expect(reportErr).toBeNull()
    const report = requireRpcResult<ReportShape>(reportData, 'get_oral_exam_report')
    expect(report.status).toBe('graded')
    expect(report.total_final_level).toBe(3)
    expect(report.descriptors).toHaveLength(6)
    expect(report.sections).toHaveLength(5)
    const fluency = report.descriptors.find((d) => d.descriptor === 'fluency')
    expect(fluency?.level).toBe(3)
    // Non-vacuous: a non-weakest descriptor stays at 4 (proves MIN, not a global floor).
    expect(report.descriptors.find((d) => d.descriptor === 'vocabulary')?.level).toBe(4)

    // Usage ledger was written by the grader (5 sections × 1 stt event).
    const { data: usage, error: usageErr } = await admin
      .from('elp_usage_events')
      .select('id')
      .eq('session_id', sessionId)
    if (usageErr) throw new Error(`usage: ${usageErr.message}`)
    expect((usage ?? []).length).toBe(5)

    // #1069: finalize emits exactly one 'oral_exam.graded' audit event, scoped to
    // this session — read via the service-role client (audit_events is
    // RLS-protected; the student cannot read it).
    const { data: gradedEvents, error: gradedEventsErr } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, resource_type, resource_id, metadata')
      .eq('event_type', 'oral_exam.graded')
      .eq('resource_id', sessionId)
    if (gradedEventsErr) throw new Error(`gradedEvents: ${gradedEventsErr.message}`)
    expect(gradedEvents ?? []).toHaveLength(1)
    const gradedEvent = gradedEvents?.[0]
    expect(gradedEvent?.actor_id).toBe(studentId)
    expect(gradedEvent?.actor_role).toBe('student')
    expect(gradedEvent?.resource_type).toBe('oral_exam_session')
    expect(gradedEvent?.metadata).toMatchObject({ total_final_level: 3, planned_sections: 5 })
  })

  it('finalizes when the last two sections are graded concurrently', async () => {
    const { sessionId, responseIds } = await startAndSubmitAll(student)
    const grade = (rid: string) =>
      admin.rpc('write_oral_section_grade', {
        p_response_id: rid,
        p_transcript: 'concurrent',
        p_transcript_meta: null,
        p_descriptor_scores: sixScores(4),
        p_usage: [],
      })
    expect(responseIds).toHaveLength(5)
    // Grade sections 1-3 sequentially, then fire 4 and 5 concurrently. The session
    // FOR UPDATE lock must still let exactly one call finalize — without it, both
    // could count the other as 'grading' and strand the session in 'grading'.
    for (let i = 0; i < 3; i++) {
      const rid = responseIds[i]
      if (!rid) throw new Error(`missing response id ${i}`)
      const { error } = await grade(rid)
      if (error) throw new Error(`grade ${i}: ${error.message}`)
    }
    const [id4, id5] = [responseIds[3], responseIds[4]]
    if (!id4 || !id5) throw new Error('expected 5 response ids')
    const [r4, r5] = await Promise.all([grade(id4), grade(id5)])
    expect(r4.error).toBeNull()
    expect(r5.error).toBeNull()

    const { data: sessionRow, error: sessionRowErr } = await admin
      .from('oral_exam_sessions')
      .select('status, total_final_level, ended_at')
      .eq('id', sessionId)
      .single()
    if (sessionRowErr) throw new Error(`sessionRow: ${sessionRowErr.message}`)
    expect(sessionRow?.status).toBe('graded')
    expect(sessionRow?.total_final_level).toBe(4)
    expect(sessionRow?.ended_at).not.toBeNull()
    // Exactly six aggregate rows — no double-finalize duplicated any.
    const { data: aggregates, error: aggregatesErr } = await admin
      .from('oral_exam_descriptor_scores')
      .select('id')
      .eq('session_id', sessionId)
      .is('section_no', null)
    if (aggregatesErr) throw new Error(`aggregates: ${aggregatesErr.message}`)
    expect((aggregates ?? []).length).toBe(6)
  })

  it('is idempotent on replay — re-grading a graded section is a no-op', async () => {
    const { sessionId, responseIds } = await startAndSubmitAll(student)
    const gradeOnce = () =>
      admin.rpc('write_oral_section_grade', {
        p_response_id: responseIds[0],
        p_transcript: 't',
        p_transcript_meta: null,
        p_descriptor_scores: sixScores(5),
        p_usage: [
          {
            event_type: 'stt_seconds',
            quantity: 10,
            provider: 'elevenlabs',
            cost_estimate_micros: null,
          },
        ],
      })
    const { error: e1 } = await gradeOnce()
    expect(e1).toBeNull()
    const { data: replayData, error: e2 } = await gradeOnce()
    expect(e2).toBeNull()
    const replay = requireRpcResult<{ status: string; reason?: string }>(
      replayData,
      'grader replay',
    )
    expect(replay.status).toBe('skipped')
    expect(replay.reason).toBe('not_grading')

    // Replay wrote no duplicate usage or scores.
    const { data: usage, error: usageErr } = await admin
      .from('elp_usage_events')
      .select('id')
      .eq('session_id', sessionId)
      .eq('section_no', 1)
    if (usageErr) throw new Error(`usage: ${usageErr.message}`)
    expect((usage ?? []).length).toBe(1)
    const { data: scores, error: scoresErr } = await admin
      .from('oral_exam_descriptor_scores')
      .select('id')
      .eq('session_id', sessionId)
      .eq('section_no', 1)
    if (scoresErr) throw new Error(`scores: ${scoresErr.message}`)
    expect((scores ?? []).length).toBe(6)

    // #1069: only 1 of 5 sections is graded — the finalize branch never ran, so no
    // 'oral_exam.graded' event exists for THIS session. Scoped by resource_id (not
    // just event_type/actor_id): other tests in this suite finalize OTHER sessions
    // for the same shared student and DO write 'oral_exam.graded' rows, so an
    // unscoped query would return >=1 and fail spuriously.
    const { data: gradedEvents, error: gradedEventsErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'oral_exam.graded')
      .eq('resource_id', sessionId)
    if (gradedEventsErr) throw new Error(`gradedEvents: ${gradedEventsErr.message}`)
    expect(gradedEvents ?? []).toHaveLength(0)
  })

  it("rejects submitting a section to another student's session", async () => {
    const { sessionId } = await startAndSubmitAll(student)
    // Non-vacuous: the victim session genuinely exists (service-role read).
    const { data: victim, error: victimErr } = await admin
      .from('oral_exam_sessions')
      .select('id')
      .eq('id', sessionId)
      .single()
    if (victimErr) throw new Error(`victim: ${victimErr.message}`)
    expect(victim?.id).toBe(sessionId)

    const { error } = await other.rpc('submit_oral_section_response', {
      p_session_id: sessionId,
      p_section_no: 1,
      p_audio_path: `x/y/${sessionId}/1.webm`,
      p_duration_ms: 1000,
    })
    expect(error?.message).toContain('oral_session_not_found')
  })

  it("rejects an audio path outside the caller's own owner prefix", async () => {
    const { data: startData } = await student.rpc('start_oral_exam_session')
    const s = requireRpcResult<{ session_id: string }>(startData, 'start')
    // Path whose owner segment ([2]) is another student — the service-role grader
    // would otherwise dereference it (bypassing storage RLS) and leak that recording.
    const { error } = await student.rpc('submit_oral_section_response', {
      p_session_id: s.session_id,
      p_section_no: 1,
      p_audio_path: `${orgId}/${otherStudentId}/${s.session_id}/1.webm`,
      p_duration_ms: 1000,
    })
    expect(error?.message).toContain('invalid_audio_path')
    // Non-vacuous: no section row was created.
    const { data: rows, error: rowsErr } = await admin
      .from('oral_exam_section_responses')
      .select('id')
      .eq('session_id', s.session_id)
    if (rowsErr) throw new Error(`rows: ${rowsErr.message}`)
    expect((rows ?? []).length).toBe(0)
  })

  it('gates the report behind exam completion (ended_at)', async () => {
    const { sessionId } = await startAndSubmitAll(student)
    const { error } = await student.rpc('get_oral_exam_report', { p_session_id: sessionId })
    expect(error?.message).toContain('oral_exam_not_complete')
  })

  it('resumes the same session on a second start (single-active invariant)', async () => {
    const { data: first } = await student.rpc('start_oral_exam_session')
    const s1 = requireRpcResult<{ session_id: string }>(first, 'start 1')
    const { data: second } = await student.rpc('start_oral_exam_session')
    const s2 = requireRpcResult<{ session_id: string }>(second, 'start 2')
    expect(s2.session_id).toBe(s1.session_id)

    // Exactly one active oral session exists for the student.
    const { data: active, error: activeErr } = await admin
      .from('oral_exam_sessions')
      .select('id')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (activeErr) throw new Error(`active: ${activeErr.message}`)
    expect((active ?? []).length).toBe(1)
  })

  it('still finalizes and records the grade when the student is soft-deleted mid-grading', async () => {
    const { sessionId, responseIds } = await startAndSubmitAll(student)
    const grade = (rid: string) =>
      admin.rpc('write_oral_section_grade', {
        p_response_id: rid,
        p_transcript: 'coalesce-branch',
        p_transcript_meta: null,
        p_descriptor_scores: sixScores(4),
        p_usage: [],
      })
    // Grade the first 4 sections as the active (not-yet-deleted) student.
    for (let i = 0; i < 4; i++) {
      const rid = responseIds[i]
      if (!rid) throw new Error(`missing response id ${i}`)
      const { error } = await grade(rid)
      if (error) throw new Error(`grade ${i}: ${error.message}`)
    }
    const lastResponseId = responseIds[4]
    if (!lastResponseId) throw new Error('expected 5 response ids')

    try {
      // Soft-delete the SHARED student fixture just before the finalizing grade —
      // the role lookup's `deleted_at IS NULL` filter (rule 10) then finds no row,
      // so v_student_role is NULL and the grader must COALESCE to 'student' rather
      // than fail the whole finalize on a NOT NULL violation (actor_role is NOT NULL).
      const { error: softDeleteErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', studentId)
      if (softDeleteErr) throw new Error(`softDelete: ${softDeleteErr.message}`)

      const { data: finalizeData, error: finalizeErr } = await grade(lastResponseId)
      if (finalizeErr) throw new Error(`finalize: ${finalizeErr.message}`)
      const finalize = requireRpcResult<{ session_finalized: boolean }>(
        finalizeData,
        'grader finalize (soft-deleted student)',
      )
      expect(finalize.session_finalized).toBe(true)

      const { data: gradedEvents, error: gradedEventsErr } = await admin
        .from('audit_events')
        .select('actor_id, actor_role')
        .eq('event_type', 'oral_exam.graded')
        .eq('resource_id', sessionId)
      if (gradedEventsErr) throw new Error(`gradedEvents: ${gradedEventsErr.message}`)
      expect(gradedEvents ?? []).toHaveLength(1)
      expect(gradedEvents?.[0]?.actor_id).toBe(studentId)
      // Primary signal: the grade finalized at all (removing COALESCE → 23502 → throw above).
      // Limitation: actor_role='student' can't uniquely prove the COALESCE-from-NULL branch,
      // since the fixture's real role is also 'student' — a dropped `deleted_at IS NULL` filter
      // would find the soft-deleted row and still return 'student'. A distinct-role fixture is
      // semantically odd for a student-owned oral session, so the NOT-NULL/finalize signal stands.
      expect(gradedEvents?.[0]?.actor_role).toBe('student')
    } finally {
      // MANDATORY restore — studentId is a SHARED fixture reused across this describe
      // block (beforeAll-seeded, torn down only in afterAll), and startAndSubmitAll
      // hardcodes ${studentId} in the audio path, so a throwaway student cannot
      // substitute here. Leaving it soft-deleted would break any later test acting
      // as this student.
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
      if (restoreErr) {
        console.error(
          `[coalesce-branch restore] failed to restore studentId: ${restoreErr.message}`,
        )
      }
    }
  })
})
