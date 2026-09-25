import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * mig 20260925000300 revokes INSERT/UPDATE/DELETE on these three tables from
 * `authenticated`, so a student write is now rejected at the privilege layer
 * (42501) before RLS is ever evaluated. We assert the error code AND verify
 * data is unchanged, since a code alone doesn't prove the row survived.
 */
describe('RLS: immutable tables', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()

  let orgId: string
  let studentClient: SupabaseClient
  let sessionId: string
  let questionIds: string[]
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Immut ${suffix}`,
      slug: `test-immut-${suffix}`,
    })

    const adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-immut-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-immut-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-immut-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `I${suffix}`,
      subjectName: `Immut Subject ${suffix}`,
      topicCode: `I${suffix}-01`,
      topicName: `Immut Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 2,
    })
    questionIds = seeded.questionIds

    // Start session and submit an answer
    const { data } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIds,
    })
    sessionId = data as string

    await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 2000,
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('cannot UPDATE quiz_session_answers (data unchanged)', async () => {
    // Attempt to change the selected option — mig 20260925000300 revokes
    // UPDATE on quiz_session_answers from authenticated, so this is now
    // rejected at the privilege layer (42501), not a silent RLS no-op.
    const { error } = await studentClient
      .from('quiz_session_answers')
      .update({ selected_option_id: 'c' })
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(error?.code).toBe('42501')

    // Verify original value is intact
    const { data, error: verifyErr } = await admin
      .from('quiz_session_answers')
      .select('selected_option_id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
      .single()
    expect(verifyErr).toBeNull()
    expect(data?.selected_option_id).toBe('b')
  })

  it('cannot DELETE quiz_session_answers (row still exists)', async () => {
    const { error } = await studentClient
      .from('quiz_session_answers')
      .delete()
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(error?.code).toBe('42501')

    const { data, error: verifyErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(verifyErr).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('cannot UPDATE student_responses (data unchanged)', async () => {
    // Get original value
    const { data: before, error: beforeErr } = await admin
      .from('student_responses')
      .select('selected_option_id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
      .limit(1)
      .single()
    expect(beforeErr).toBeNull()

    const { error } = await studentClient
      .from('student_responses')
      .update({ selected_option_id: 'c' })
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(error?.code).toBe('42501')

    const { data: after, error: afterErr } = await admin
      .from('student_responses')
      .select('selected_option_id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
      .limit(1)
      .single()
    expect(afterErr).toBeNull()
    expect(after?.selected_option_id).toBe(before?.selected_option_id)
  })

  it('cannot DELETE student_responses (row still exists)', async () => {
    const { data: before, error: beforeErr } = await admin
      .from('student_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(beforeErr).toBeNull()

    const { error } = await studentClient
      .from('student_responses')
      .delete()
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(error?.code).toBe('42501')

    const { data: after, error: afterErr } = await admin
      .from('student_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(afterErr).toBeNull()
    expect(after).toHaveLength(before?.length ?? 0)
  })

  it('cannot UPDATE audit_events (data unchanged)', async () => {
    const { data: events, error: eventsErr } = await admin
      .from('audit_events')
      .select('id, event_type')
      .eq('organization_id', orgId)
      .limit(1)

    expect(eventsErr).toBeNull()
    expect(events?.length).toBeGreaterThan(0)
    // Previous expect guarantees events is non-empty
    const original = events![0]!

    // Student attempts to update. mig 20260925000300 revokes UPDATE on
    // audit_events from authenticated, so this is rejected at the privilege
    // layer (42501) before RLS is ever evaluated.
    const { error } = await studentClient
      .from('audit_events')
      .update({ event_type: 'hacked' })
      .eq('id', original.id)
    expect(error?.code).toBe('42501')

    const { data: after, error: afterErr } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('id', original.id)
      .single()
    expect(afterErr).toBeNull()
    expect(after?.event_type).toBe(original.event_type)
  })

  it('cannot DELETE audit_events (row still exists)', async () => {
    const { data: events, error: eventsErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1)

    expect(eventsErr).toBeNull()
    expect(events?.length).toBeGreaterThan(0)
    // Previous expect guarantees events is non-empty
    const eventId = events![0]!.id

    const { error } = await studentClient.from('audit_events').delete().eq('id', eventId)
    expect(error?.code).toBe('42501')

    const { data: after, error: afterErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('id', eventId)
    expect(afterErr).toBeNull()
    expect(after).toHaveLength(1)
  })
})
