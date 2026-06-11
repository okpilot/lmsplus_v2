import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

describe('RPC: complete_quiz_session', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Complete ${suffix}`,
      slug: `test-complete-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-complete-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-complete-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-complete-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `C${suffix}`,
      subjectName: `Complete Subject ${suffix}`,
      topicCode: `C${suffix}-01`,
      topicName: `Complete Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  async function startAndAnswer(opts: { correctCount: number; totalCount: number }) {
    const qIds = questionIds.slice(0, opts.totalCount)
    const { data: sessionId } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: qIds,
    })

    for (let i = 0; i < opts.totalCount; i++) {
      const isCorrect = i < opts.correctCount
      await studentClient.rpc('submit_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: qIds[i],
        p_selected_option: isCorrect ? 'b' : 'a', // 'b' is correct
        p_response_time_ms: 2000,
      })
    }

    return sessionId as string
  }

  it('calculates correct score (2/3 = 66.67%)', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 2,
      totalCount: 3,
    })

    const { data, error } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    expect(data?.[0].total_questions).toBe(3)
    expect(data?.[0].correct_count).toBe(2)
    expect(Number(data?.[0].score_percentage)).toBeCloseTo(66.67, 1)
  })

  it('sets ended_at on session', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    const { data: session, error: sessionErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .single()
    expect(sessionErr).toBeNull()
    expect(session?.ended_at).not.toBeNull()
  })

  it('creates audit event with score metadata', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 3,
      totalCount: 3,
    })

    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    const { data: events, error: eventsErr } = await admin
      .from('audit_events')
      .select('event_type, metadata')
      .eq('resource_id', sessionId)
      .eq('event_type', 'quiz_session.completed')

    expect(eventsErr).toBeNull()
    expect(events).toHaveLength(1)
    expect(events![0]!.metadata).toMatchObject({
      total: 3,
      correct: 3,
      score: 100,
    })
  })

  it('rejects completing another student session', async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-complete-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)

    const studentBClient = await getAuthenticatedClient({
      email: `studentB-complete-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    const { error } = await studentBClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or already completed')
  })

  it('rejects completing an already-completed session', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    const { error } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or already completed')
  })

  it('rejects a soft-deleted caller before completing the session', async () => {
    // Mig 104 (PR #830) adds an explicit active-user gate right after the auth
    // check, mirroring batch_submit_quiz (mig 095c) — a soft-deleted caller is
    // rejected before any session read. The deleted_at-filtered audit
    // actor_role subquery (security.md rule 10) remains as defense-in-depth
    // behind the gate.
    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    // Soft-delete the student mid-session.
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      const { error } = await studentClient.rpc('complete_quiz_session', {
        p_session_id: sessionId,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user not found or inactive')

      // Fail-closed means nothing was written — the session must remain open,
      // not half-completed without an audit row.
      const { data: sessionRow, error: readErr } = await admin
        .from('quiz_sessions')
        .select('ended_at')
        .eq('id', sessionId)
        .single()
      expect(readErr).toBeNull()
      expect(sessionRow?.ended_at).toBeNull()
    } finally {
      // Restore so afterAll cleanup can delete the row cleanly.
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
      if (restoreErr) {
        console.error('[soft-delete restore] student row left soft-deleted:', restoreErr.message)
      }

      // Force-end the session so it does not block afterAll cleanup.
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (endErr) {
        console.error('[force-end] session left active:', endErr.message)
      }
    }
  })
})
