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

describe('RPC: start_quiz_session', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Start ${suffix}`,
      slug: `test-start-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-start-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-start-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-start-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `S${suffix}`,
      subjectName: `Start Subject ${suffix}`,
      topicCode: `S${suffix}-01`,
      topicName: `Start Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 5,
    })
    questionIds = seeded.questionIds
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  it('creates a session and returns a UUID', async () => {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 3),
    })
    expect(error).toBeNull()
    expect(data).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('locks question IDs in config', async () => {
    const qIds = questionIds.slice(0, 2)
    const { data: sessionId } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: qIds,
    })

    const { data: session } = await admin
      .from('quiz_sessions')
      .select('config, total_questions, mode, subject_id, topic_id')
      .eq('id', sessionId)
      .single()

    expect(session?.config.question_ids).toEqual(qIds)
    expect(session?.total_questions).toBe(2)
    expect(session?.mode).toBe('quick_quiz')
    expect(session?.subject_id).toBe(refs.subjectId)
    expect(session?.topic_id).toBe(refs.topicId)
  })

  it('creates an audit event', async () => {
    const { data: sessionId } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: null,
      p_question_ids: questionIds.slice(0, 1),
    })

    const { data: events } = await admin
      .from('audit_events')
      .select('event_type, resource_type, resource_id')
      .eq('resource_id', sessionId)

    expect(events).toHaveLength(1)
    expect(events?.[0].event_type).toBe('quiz_session.started')
    expect(events?.[0].resource_type).toBe('quiz_session')
  })

  it('allows null subject/topic for smart_review', async () => {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })
})
