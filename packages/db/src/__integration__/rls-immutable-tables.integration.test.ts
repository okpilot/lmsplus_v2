import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  seedQuestions,
  seedReferenceData,
} from './setup'

/**
 * PostgREST + RLS: when a policy like `FOR UPDATE USING (false)` blocks
 * an operation, PostgREST returns success with 0 affected rows (no error).
 * We verify immutability by checking data is unchanged after the attempt.
 */
describe('RLS: immutable tables', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId: string
  let studentClient: SupabaseClient
  let sessionId: string
  let questionIds: string[]
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

    const refs = await seedReferenceData({
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
  })

  it('cannot UPDATE quiz_session_answers (data unchanged)', async () => {
    // Attempt to change the selected option
    await studentClient
      .from('quiz_session_answers')
      .update({ selected_option_id: 'c' })
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])

    // Verify original value is intact
    const { data } = await admin
      .from('quiz_session_answers')
      .select('selected_option_id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
      .single()
    expect(data?.selected_option_id).toBe('b')
  })

  it('cannot DELETE quiz_session_answers (row still exists)', async () => {
    await studentClient
      .from('quiz_session_answers')
      .delete()
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])

    const { data } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(data).toHaveLength(1)
  })

  it('cannot UPDATE student_responses (data unchanged)', async () => {
    // Get original value
    const { data: before } = await admin
      .from('student_responses')
      .select('selected_option_id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
      .limit(1)
      .single()

    await studentClient
      .from('student_responses')
      .update({ selected_option_id: 'c' })
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])

    const { data: after } = await admin
      .from('student_responses')
      .select('selected_option_id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
      .limit(1)
      .single()
    expect(after?.selected_option_id).toBe(before?.selected_option_id)
  })

  it('cannot DELETE student_responses (row still exists)', async () => {
    const { data: before } = await admin
      .from('student_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])

    await studentClient
      .from('student_responses')
      .delete()
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])

    const { data: after } = await admin
      .from('student_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(after).toHaveLength(before?.length)
  })

  it('cannot UPDATE audit_events (data unchanged)', async () => {
    const { data: events } = await admin
      .from('audit_events')
      .select('id, event_type')
      .eq('organization_id', orgId)
      .limit(1)

    expect(events?.length).toBeGreaterThan(0)
    const original = events?.[0]

    // Student attempts to update (students can't even read audit_events,
    // so RLS blocks the update silently)
    await studentClient.from('audit_events').update({ event_type: 'hacked' }).eq('id', original.id)

    const { data: after } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('id', original.id)
      .single()
    expect(after?.event_type).toBe(original.event_type)
  })

  it('cannot DELETE audit_events (row still exists)', async () => {
    const { data: events } = await admin
      .from('audit_events')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1)

    expect(events?.length).toBeGreaterThan(0)

    await studentClient.from('audit_events').delete().eq('id', events?.[0].id)

    const { data: after } = await admin.from('audit_events').select('id').eq('id', events?.[0].id)
    expect(after).toHaveLength(1)
  })
})
