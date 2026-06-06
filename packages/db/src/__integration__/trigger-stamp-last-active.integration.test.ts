import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * Integration tests for trg_stamp_last_active_on_session_complete (migration 092, #532).
 *
 * The trigger fires AFTER UPDATE OF ended_at on quiz_sessions, on the
 * ended_at NULL → NOT NULL transition. When auth.uid() equals the session
 * owner (student completes their own session), it stamps users.last_active_at.
 * When auth.uid() is NULL or a different user (service-role sweep, admin void),
 * the stamp is skipped.
 *
 * Two behaviours verified here:
 *
 *  1. Student completes their own session via batch_submit_quiz →
 *     last_active_at must be updated.
 *
 *  2. Service-role direct ended_at write (auth.uid() = NULL in that context) →
 *     last_active_at must NOT be updated. This is representative of both the
 *     service-role sweeper and any other non-student-initiated completion that
 *     bypasses RLS (the trigger guard is auth.uid() = student_id, so NULL ≠
 *     student_id is false and the stamp is skipped).
 */
describe('trigger: stamp_last_active_on_session_complete', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let questionId: string
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org LastActive ${suffix}`,
      slug: `test-last-active-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-last-active-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-last-active-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-last-active-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `LA${suffix}`,
      subjectName: `LastActive Subject ${suffix}`,
      topicCode: `LA${suffix}-01`,
      topicName: `LastActive Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    const [seededId] = seeded.questionIds
    if (!seededId) throw new Error('seedQuestions returned no question ids')
    questionId = seededId
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('stamps last_active_at when a student completes their own session via batch_submit_quiz', async () => {
    // Zero the stamp first so the before/after comparison is unambiguous.
    const { error: zeroErr } = await admin
      .from('users')
      .update({ last_active_at: null })
      .eq('id', studentId)
    if (zeroErr) throw new Error(`zero last_active_at: ${zeroErr.message}`)

    // Start a session as the student — pins questionId into config.question_ids.
    const { data: sessionData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [questionId],
    })
    expect(startErr).toBeNull()
    if (typeof sessionData !== 'string') {
      throw new Error('start_quiz_session did not return a session id string')
    }
    const sessionId = sessionData

    // Derive the correct option id from the seeded question. Service-role read
    // is safe here — we just need the options array for the submit payload.
    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .select('options')
      .eq('id', questionId)
      .single()
    expect(qErr).toBeNull()
    const options = qRow?.options as unknown as Array<{ id: string; correct: boolean }>
    expect(Array.isArray(options)).toBe(true)
    const correctOption = options.find((o) => o.correct === true)
    if (!correctOption) throw new Error('seeded question has no correct option')

    // Submit via batch_submit_quiz (the live completion path, not the deprecated RPC).
    // The trigger fires inside this call — auth.uid() is the student's JWT subject.
    const t_before = new Date()
    const { error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        {
          question_id: questionId,
          selected_option: correctOption.id,
          response_time_ms: 3000,
        },
      ],
    })
    const t_after = new Date()
    expect(submitErr).toBeNull()

    // The trigger must have written last_active_at between t_before and t_after.
    const { data: userRow, error: readErr } = await admin
      .from('users')
      .select('last_active_at')
      .eq('id', studentId)
      .single()
    expect(readErr).toBeNull()
    expect(userRow?.last_active_at).not.toBeNull()

    const stamped = new Date(userRow?.last_active_at as string)
    // Allow 2 s of clock skew between the test client and the DB server.
    expect(stamped.getTime()).toBeGreaterThanOrEqual(t_before.getTime() - 2_000)
    expect(stamped.getTime()).toBeLessThanOrEqual(t_after.getTime() + 2_000)
  })

  it('does NOT stamp last_active_at when ended_at is set by a service-role UPDATE (auth.uid() = NULL)', async () => {
    // Verify the trigger guard: auth.uid() = NEW.student_id is FALSE when the
    // caller is the service-role (auth.uid() is NULL in that context). This
    // exercises the same skip path taken by the admin void_internal_exam_code
    // and any future service-role sweeper.

    // Reset the stamp to a known sentinel value so "unchanged" is unambiguous.
    const sentinel = new Date(Date.now() - 60_000).toISOString()
    const { error: setErr } = await admin
      .from('users')
      .update({ last_active_at: sentinel })
      .eq('id', studentId)
    if (setErr) throw new Error(`set sentinel last_active_at: ${setErr.message}`)

    // Seed an active (not yet ended) session directly via service-role so we
    // can transition ended_at without going through an authenticated RPC.
    const { data: sessionRow, error: seedErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        subject_id: refs.subjectId,
        config: { question_ids: [questionId], pass_mark: null },
        total_questions: 1,
        time_limit_seconds: 60,
      })
      .select('id')
      .single()
    if (seedErr || !sessionRow) throw new Error(`seed session: ${seedErr?.message}`)
    const sessionId = sessionRow.id

    // Set ended_at as service-role (auth.uid() = NULL): trigger fires but the
    // guard (auth.uid() = student_id) is false, so last_active_at must NOT change.
    const { error: endErr } = await admin
      .from('quiz_sessions')
      .update({
        ended_at: new Date().toISOString(),
        score_percentage: 100,
        passed: null,
        correct_count: 1,
      })
      .eq('id', sessionId)
    if (endErr) throw new Error(`set ended_at: ${endErr.message}`)

    // last_active_at must still be the sentinel — no change from the trigger.
    const { data: userRow, error: readErr } = await admin
      .from('users')
      .select('last_active_at')
      .eq('id', studentId)
      .single()
    expect(readErr).toBeNull()
    // A changed value would indicate the trigger fired without a student JWT —
    // that would mean the guard is broken and admin/sweeper actions pollute the
    // activity timestamp.
    //
    // Compare as timestamps, not strings: PostgreSQL serialises TIMESTAMPTZ as
    // "+00:00" while JS toISOString() produces "Z" — both represent the same
    // instant but string equality would fail.
    const storedAt = userRow?.last_active_at
      ? new Date(userRow.last_active_at as string).getTime()
      : null
    expect(storedAt).toBe(new Date(sentinel).getTime())

    // Cleanup the seeded session so cleanupTestData doesn't encounter FK issues.
    const { error: cleanupErr } = await admin.from('quiz_sessions').delete().eq('id', sessionId)
    if (cleanupErr) console.error('[test cleanup] failed to delete session:', cleanupErr.message)
  })
})
