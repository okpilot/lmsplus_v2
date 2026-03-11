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

describe('RLS: tenant isolation', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  // Org A
  let orgAId: string
  let studentAClient: SupabaseClient
  let instructorAClient: SupabaseClient
  let questionIdsA: string[]
  const userIdsA: string[] = []

  // Org B
  let orgBId: string
  let studentBClient: SupabaseClient
  const userIdsB: string[] = []

  // Same-org students
  let studentA2Client: SupabaseClient

  beforeAll(async () => {
    // --- Org A ---
    orgAId = await createTestOrg({
      admin,
      name: `Org A ${suffix}`,
      slug: `org-a-${suffix}`,
    })

    const adminAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: `adminA-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIdsA.push(adminAId)

    const studentAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: `studentA-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIdsA.push(studentAId)

    const studentA2Id = await createTestUser({
      admin,
      orgId: orgAId,
      email: `studentA2-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIdsA.push(studentA2Id)

    const instructorAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: `instructorA-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'instructor',
    })
    userIdsA.push(instructorAId)

    studentAClient = await getAuthenticatedClient({
      email: `studentA-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    studentA2Client = await getAuthenticatedClient({
      email: `studentA2-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    instructorAClient = await getAuthenticatedClient({
      email: `instructorA-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const refsA = await seedReferenceData({
      admin,
      subjectCode: `TA${suffix}`,
      subjectName: `Tenant A Subject ${suffix}`,
      topicCode: `TA${suffix}-01`,
      topicName: `Tenant A Topic ${suffix}`,
    })

    const seededA = await seedQuestions({
      admin,
      orgId: orgAId,
      createdBy: adminAId,
      subjectId: refsA.subjectId,
      topicId: refsA.topicId,
      count: 3,
    })
    questionIdsA = seededA.questionIds

    // Create a session for studentA (for cross-student tests)
    await studentAClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIdsA.slice(0, 1),
    })

    // Create an FSRS card for studentA
    await admin.from('fsrs_cards').insert({
      student_id: studentAId,
      question_id: questionIdsA[0],
      due: new Date().toISOString(),
      stability: 1.0,
      difficulty: 5.0,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 'learning',
    })

    // --- Org B ---
    orgBId = await createTestOrg({
      admin,
      name: `Org B ${suffix}`,
      slug: `org-b-${suffix}`,
    })

    const adminBId = await createTestUser({
      admin,
      orgId: orgBId,
      email: `adminB-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIdsB.push(adminBId)

    const studentBId = await createTestUser({
      admin,
      orgId: orgBId,
      email: `studentB-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIdsB.push(studentBId)

    studentBClient = await getAuthenticatedClient({
      email: `studentB-${suffix}@test.local`,
      password: 'test-pass-123',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId: orgAId, userIds: userIdsA })
    await cleanupTestData({ admin, orgId: orgBId, userIds: userIdsB })
  })

  it('student in orgB cannot read orgA questions', async () => {
    const { data } = await studentBClient.from('questions').select('id').in('id', questionIdsA)
    expect(data).toHaveLength(0)
  })

  it('student in orgB cannot read orgA quiz sessions', async () => {
    const { data } = await studentBClient
      .from('quiz_sessions')
      .select('id')
      .eq('organization_id', orgAId)
    expect(data).toHaveLength(0)
  })

  it('student in orgB cannot read orgA student responses', async () => {
    const { data } = await studentBClient
      .from('student_responses')
      .select('id')
      .eq('organization_id', orgAId)
    expect(data).toHaveLength(0)
  })

  it('student cannot read another student FSRS cards (same org)', async () => {
    const { data } = await studentA2Client.from('fsrs_cards').select('id')
    // studentA2 should only see their own cards (none seeded)
    expect(data).toHaveLength(0)
  })

  it('student cannot read audit events', async () => {
    const { data } = await studentAClient.from('audit_events').select('id')
    expect(data).toHaveLength(0)
  })

  it('instructor can read audit events in own org', async () => {
    const { data } = await instructorAClient
      .from('audit_events')
      .select('id')
      .eq('organization_id', orgAId)
    expect(data?.length).toBeGreaterThan(0)
  })

  it('student can only see own quiz sessions (same org)', async () => {
    // studentA2 has no sessions
    const { data } = await studentA2Client.from('quiz_sessions').select('id')
    expect(data).toHaveLength(0)

    // studentA has 1 session
    const { data: dataA } = await studentAClient.from('quiz_sessions').select('id')
    expect(dataA?.length).toBeGreaterThan(0)
  })
})
