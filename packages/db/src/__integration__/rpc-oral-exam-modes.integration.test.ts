import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// AI ICAO ELP session modes (migs 153-154): start_oral_exam_session(p_mode)
// generalizes to 'practice' (1 section) vs 'mock' (5 sections), and both
// submit_oral_section_response and write_oral_section_grade finalize against
// the session's OWN planned count (frozen in config at start) instead of a
// hardcoded 5. Mocked clients can't see the real config JSONB shape or the
// ON CONFLICT inference, so this must run against real Postgres.

const DESCRIPTORS = [
  'pronunciation',
  'structure',
  'vocabulary',
  'fluency',
  'comprehension',
  'interaction',
] as const

function sixScores(level: number, overrides: Record<string, number> = {}) {
  return DESCRIPTORS.map((descriptor) => ({
    descriptor,
    level: overrides[descriptor] ?? level,
    rationale: `evidence for ${descriptor}`,
  }))
}

type StartResult = { session_id: string; status: string; mode: string }

describe('RPC: ELP oral exam — session modes (practice vs mock)', () => {
  const admin = getAdminClient()
  let orgId: string
  let studentId: string
  let student: SupabaseClient
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `ELP Modes Org ${suffix}`,
      slug: `elp-modes-${suffix}`,
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: `elp-modes-stud-${suffix}@test.local`,
      password: 'pw',
      role: 'student',
    })
    userIds.push(studentId)
    student = await getAuthenticatedClient({
      email: `elp-modes-stud-${suffix}@test.local`,
      password: 'pw',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  // Each test starts from a clean slate: soft-delete any active oral session for the
  // reused student so the single-active unique index does not block a fresh start.
  beforeEach(async () => {
    const { error } = await admin
      .from('oral_exam_sessions')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'discarded',
        ended_at: new Date().toISOString(),
      })
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`clearActiveOral: ${error.message}`)
  })

  async function submitSection(sessionId: string, sectionNo: number) {
    return student.rpc('submit_oral_section_response', {
      p_session_id: sessionId,
      p_section_no: sectionNo,
      p_audio_path: `${orgId}/${studentId}/${sessionId}/${sectionNo}.webm`,
      p_duration_ms: 5000,
    })
  }

  it('a practice session (p_mode=practice) needs only section 1 to flip to grading', async () => {
    const { data: startData, error: startErr } = await student.rpc('start_oral_exam_session', {
      p_mode: 'practice',
    })
    if (startErr) throw new Error(`start: ${startErr.message}`)
    const start = requireRpcResult<StartResult>(startData, 'start_oral_exam_session')
    expect(start.mode).toBe('practice')
    expect(start.status).toBe('in_progress')

    // Non-vacuous: the session genuinely starts in_progress before the submit.
    const { data: before, error: beforeErr } = await admin
      .from('oral_exam_sessions')
      .select('status')
      .eq('id', start.session_id)
      .single()
    if (beforeErr) throw new Error(`before: ${beforeErr.message}`)
    expect(before?.status).toBe('in_progress')

    const { error: submitErr } = await submitSection(start.session_id, 1)
    if (submitErr) throw new Error(`submit: ${submitErr.message}`)

    const { data: after, error: afterErr } = await admin
      .from('oral_exam_sessions')
      .select('status')
      .eq('id', start.session_id)
      .single()
    if (afterErr) throw new Error(`after: ${afterErr.message}`)
    expect(after?.status).toBe('grading')
  })

  it("grading the single practice section finalizes the session at that section's MIN", async () => {
    const { data: startData } = await student.rpc('start_oral_exam_session', { p_mode: 'practice' })
    const start = requireRpcResult<StartResult>(startData, 'start')
    const { data: submitData, error: submitErr } = await submitSection(start.session_id, 1)
    if (submitErr) throw new Error(`submit: ${submitErr.message}`)
    if (typeof submitData !== 'string') throw new Error('expected a response id string')
    const responseId = submitData

    // fluency=3, every other descriptor=4 → weakest-link MIN across descriptors = 3.
    const { error: gradeErr } = await admin.rpc('write_oral_section_grade', {
      p_response_id: responseId,
      p_transcript: 'practice section',
      p_transcript_meta: null,
      p_descriptor_scores: sixScores(4, { fluency: 3 }),
      p_usage: [],
    })
    if (gradeErr) throw new Error(`grade: ${gradeErr.message}`)

    const { data: sessionRow, error: sessionRowErr } = await admin
      .from('oral_exam_sessions')
      .select('status, total_final_level, ended_at')
      .eq('id', start.session_id)
      .single()
    if (sessionRowErr) throw new Error(`sessionRow: ${sessionRowErr.message}`)
    expect(sessionRow?.status).toBe('graded')
    // Non-vacuous: 3 (the weakest descriptor) proves MIN, not a global floor of 4.
    expect(sessionRow?.total_final_level).toBe(3)
    expect(sessionRow?.ended_at).not.toBeNull()
  })

  it('a mock session (p_mode=mock) does not finalize after 4 of 5 sections are graded', async () => {
    const { data: startData } = await student.rpc('start_oral_exam_session', { p_mode: 'mock' })
    const start = requireRpcResult<StartResult>(startData, 'start')
    expect(start.mode).toBe('mock')

    const responseIds: string[] = []
    for (let n = 1; n <= 5; n++) {
      const { data, error } = await submitSection(start.session_id, n)
      if (error) throw new Error(`submit ${n}: ${error.message}`)
      if (typeof data !== 'string') throw new Error(`submit ${n}: expected a response id string`)
      responseIds.push(data)
    }

    // Grade only the first 4 of 5 sections.
    for (let i = 0; i < 4; i++) {
      const { error } = await admin.rpc('write_oral_section_grade', {
        p_response_id: responseIds[i],
        p_transcript: `section ${i + 1}`,
        p_transcript_meta: null,
        p_descriptor_scores: sixScores(4),
        p_usage: [],
      })
      if (error) throw new Error(`grade ${i}: ${error.message}`)
    }

    // Non-vacuous: the 4 graded sections genuinely exist as 'graded' before asserting
    // the session as a whole is still NOT finalized.
    const { data: gradedRows, error: gradedRowsErr } = await admin
      .from('oral_exam_section_responses')
      .select('id')
      .eq('session_id', start.session_id)
      .eq('status', 'graded')
    if (gradedRowsErr) throw new Error(`gradedRows: ${gradedRowsErr.message}`)
    expect((gradedRows ?? []).length).toBe(4)

    const { data: midSession, error: midSessionErr } = await admin
      .from('oral_exam_sessions')
      .select('status, ended_at')
      .eq('id', start.session_id)
      .single()
    if (midSessionErr) throw new Error(`midSession: ${midSessionErr.message}`)
    expect(midSession?.status).toBe('grading')
    expect(midSession?.ended_at).toBeNull()

    // Grade the 5th section — now it finalizes.
    const fifthId = responseIds[4]
    if (!fifthId) throw new Error('expected 5 response ids')
    const { error: fifthErr } = await admin.rpc('write_oral_section_grade', {
      p_response_id: fifthId,
      p_transcript: 'section 5',
      p_transcript_meta: null,
      p_descriptor_scores: sixScores(4),
      p_usage: [],
    })
    if (fifthErr) throw new Error(`grade 5: ${fifthErr.message}`)

    const { data: finalSession, error: finalSessionErr } = await admin
      .from('oral_exam_sessions')
      .select('status, ended_at')
      .eq('id', start.session_id)
      .single()
    if (finalSessionErr) throw new Error(`finalSession: ${finalSessionErr.message}`)
    expect(finalSession?.status).toBe('graded')
    expect(finalSession?.ended_at).not.toBeNull()
  })

  it('rejects a start request with an invalid mode', async () => {
    const { error } = await student.rpc('start_oral_exam_session', { p_mode: 'invalid' })
    expect(error?.message).toContain('invalid_mode')

    // Non-vacuous: no session row was created for the rejected start.
    const { data: rows, error: rowsErr } = await admin
      .from('oral_exam_sessions')
      .select('id')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .is('ended_at', null)
    if (rowsErr) throw new Error(`rows: ${rowsErr.message}`)
    expect((rows ?? []).length).toBe(0)
  })

  it('rejects submitting section 2 on a practice (1-section) session', async () => {
    const { data: startData } = await student.rpc('start_oral_exam_session', { p_mode: 'practice' })
    const start = requireRpcResult<StartResult>(startData, 'start')

    const { error } = await submitSection(start.session_id, 2)
    expect(error?.message).toContain('invalid_section_no')

    // Non-vacuous: the session is still in_progress, no response row was created.
    const { data: sessionRow, error: sessionRowErr } = await admin
      .from('oral_exam_sessions')
      .select('status')
      .eq('id', start.session_id)
      .single()
    if (sessionRowErr) throw new Error(`sessionRow: ${sessionRowErr.message}`)
    expect(sessionRow?.status).toBe('in_progress')
    const { data: responseRows, error: responseRowsErr } = await admin
      .from('oral_exam_section_responses')
      .select('id')
      .eq('session_id', start.session_id)
    if (responseRowsErr) throw new Error(`responseRows: ${responseRowsErr.message}`)
    expect((responseRows ?? []).length).toBe(0)
  })

  it('rejects a submit when the session config is missing its sections array', async () => {
    const { data: startData } = await student.rpc('start_oral_exam_session', { p_mode: 'practice' })
    const start = requireRpcResult<StartResult>(startData, 'start')

    // Corrupt the frozen config so the sections array is absent — the defensive
    // v_planned guard must reject cleanly rather than strand or crash the submit.
    const { data: corrupted, error: corruptErr } = await admin
      .from('oral_exam_sessions')
      .update({ config: { mode: 'practice' } })
      .eq('id', start.session_id)
      .select('id')
    if (corruptErr) throw new Error(`corrupt: ${corruptErr.message}`)
    if ((corrupted ?? []).length !== 1) throw new Error('corrupt matched no session row')

    const { error } = await submitSection(start.session_id, 1)
    expect(error?.message).toContain('invalid_session_config')

    // Non-vacuous: the rejected submit created no response row.
    const { data: responseRows, error: responseRowsErr } = await admin
      .from('oral_exam_section_responses')
      .select('id')
      .eq('session_id', start.session_id)
    if (responseRowsErr) throw new Error(`responseRows: ${responseRowsErr.message}`)
    expect((responseRows ?? []).length).toBe(0)
  })

  it('resumes the same session on a second start regardless of mode (single-active invariant)', async () => {
    const { data: first } = await student.rpc('start_oral_exam_session', { p_mode: 'practice' })
    const s1 = requireRpcResult<StartResult>(first, 'start 1')
    const { data: second } = await student.rpc('start_oral_exam_session', { p_mode: 'mock' })
    const s2 = requireRpcResult<StartResult>(second, 'start 2')
    // The resumed session keeps its ORIGINAL mode — the second call's p_mode is
    // ignored once an active session exists.
    expect(s2.session_id).toBe(s1.session_id)
    expect(s2.mode).toBe('practice')

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

  // Gap: the grader-side v_planned guard in write_oral_section_grade (mig 154)
  // raises invalid_session_config independently of the submit-side guard in
  // submit_oral_section_response (mig 153). The submit-side path is covered by an
  // earlier test; this exercises the distinct grader-side path.
  it('rejects a grade call when the session config has no sections array', async () => {
    const { data: startData } = await student.rpc('start_oral_exam_session', { p_mode: 'practice' })
    const start = requireRpcResult<StartResult>(startData, 'start')

    // Submit section 1 to create a response row the grader can reference.
    const { data: submitData, error: submitErr } = await submitSection(start.session_id, 1)
    if (submitErr) throw new Error(`submit: ${submitErr.message}`)
    if (typeof submitData !== 'string') throw new Error('expected a response id string')
    const responseId = submitData

    // Corrupt the session config: remove the sections array so v_planned resolves
    // to NULL (the grader's step-2b branch, distinct from the submit-side guard).
    const { data: corrupted, error: corruptErr } = await admin
      .from('oral_exam_sessions')
      .update({ config: { mode: 'practice' } })
      .eq('id', start.session_id)
      .select('id')
    if (corruptErr) throw new Error(`corrupt: ${corruptErr.message}`)
    if ((corrupted ?? []).length !== 1) throw new Error('corrupt matched no session row')

    const { error: gradeErr } = await admin.rpc('write_oral_section_grade', {
      p_response_id: responseId,
      p_transcript: 'test transcript',
      p_transcript_meta: null,
      p_descriptor_scores: sixScores(4),
      p_usage: [],
    })
    expect(gradeErr?.message).toContain('invalid_session_config')

    // Non-vacuous: no descriptor scores were written (the guard fired before step 3).
    const { data: descriptorRows, error: descriptorErr } = await admin
      .from('oral_exam_descriptor_scores')
      .select('id')
      .eq('session_id', start.session_id)
    if (descriptorErr) throw new Error(`descriptorRows: ${descriptorErr.message}`)
    expect((descriptorRows ?? []).length).toBe(0)

    // Non-vacuous: the section response is still in 'grading' (the grader did not
    // flip it to 'graded' — that happens at step 4, after the guard at step 2b).
    const { data: responseRow, error: responseRowErr } = await admin
      .from('oral_exam_section_responses')
      .select('status')
      .eq('id', responseId)
      .single()
    if (responseRowErr) throw new Error(`responseRow: ${responseRowErr.message}`)
    expect(responseRow?.status).toBe('grading')
  })

  // Gap: sessions started before mig 153 have no 'mode' key in their config.
  // The COALESCE(config->>'mode', 'mock') in the resume branch of
  // start_oral_exam_session must default to 'mock' rather than returning null.
  it("returns mode 'mock' when resuming a session whose config has no mode key", async () => {
    // Simulate a pre-mig-153 session: config has sections but no 'mode' key.
    const legacySections = [
      { section_no: 1, type: 'interview' },
      { section_no: 2, type: 'picture' },
      { section_no: 3, type: 'comms' },
      { section_no: 4, type: 'listening' },
      { section_no: 5, type: 'video' },
    ]
    const { data: inserted, error: insertErr } = await admin
      .from('oral_exam_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        status: 'in_progress',
        config: { sections: legacySections }, // deliberately no 'mode' key
      })
      .select('id')
      .single()
    if (insertErr) throw new Error(`insert legacy session: ${insertErr.message}`)
    if (!inserted || typeof inserted !== 'object' || !('id' in inserted)) {
      throw new Error('insert legacy session: unexpected result shape')
    }
    const legacyId = (inserted as { id: string }).id

    // Non-vacuous: confirm the inserted config genuinely has no 'mode' key.
    const { data: pre, error: preErr } = await admin
      .from('oral_exam_sessions')
      .select('config')
      .eq('id', legacyId)
      .single()
    if (preErr) throw new Error(`pre: ${preErr.message}`)
    expect((pre?.config as Record<string, unknown>)?.mode).toBeUndefined()

    // Calling start with any p_mode resumes the existing active session; the
    // COALESCE default must produce 'mock', not null or the requested 'practice'.
    const { data: resumeData, error: resumeErr } = await student.rpc('start_oral_exam_session', {
      p_mode: 'practice', // intentionally different — must be ignored on resume
    })
    if (resumeErr) throw new Error(`resume: ${resumeErr.message}`)
    const resumed = requireRpcResult<StartResult>(resumeData, 'resume')

    expect(resumed.session_id).toBe(legacyId)
    expect(resumed.mode).toBe('mock')
    // The sections array from the legacy config must be preserved (5, not 1 as
    // a fresh practice session would have). Cast via unknown: StartResult omits
    // sections for brevity but the RPC always returns it.
    const resumedSections = (resumed as unknown as { sections: unknown[] }).sections
    expect(Array.isArray(resumedSections)).toBe(true)
    expect(resumedSections).toHaveLength(5)
  })
})
