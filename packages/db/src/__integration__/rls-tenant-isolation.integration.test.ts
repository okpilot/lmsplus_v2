import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

describe('RLS: tenant isolation', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()

  // Org A
  let orgAId: string
  let studentAId: string
  let sessionAId: string
  let studentAClient: SupabaseClient
  let instructorAClient: SupabaseClient
  let questionIdsA: string[]
  let refsA: Awaited<ReturnType<typeof seedReferenceData>>
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

    studentAId = await createTestUser({
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

    refsA = await seedReferenceData({
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

    // Create a session for studentA (for cross-student and cross-org tests).
    // start_quiz_session returns the session id as a string.
    const { data: newSessionId, error: sessionStartError } = await studentAClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'quick_quiz',
        p_subject_id: null,
        p_topic_id: null,
        p_question_ids: questionIdsA.slice(0, 1),
      },
    )
    if (sessionStartError)
      throw new Error(`start_quiz_session failed: ${sessionStartError.message}`)
    // start_quiz_session can return null with no error; without this guard the
    // failure surfaces as an opaque student_responses insert error below.
    if (typeof newSessionId !== 'string')
      throw new Error(
        `start_quiz_session returned a non-string id: ${JSON.stringify(newSessionId)}`,
      )
    sessionAId = newSessionId

    // Seed a student_response for studentA so the cross-org isolation test (test 3)
    // has a real row to protect. Cleanup is handled by cleanupTestData via organization_id.
    const { error: responseError } = await admin.from('student_responses').insert({
      student_id: studentAId,
      question_id: questionIdsA[0],
      organization_id: orgAId,
      session_id: sessionAId,
      is_correct: false,
      response_time_ms: 1000,
      // response_text satisfies the student_responses_answer_shape_check constraint
      // (branch 2: selected_option_id IS NULL AND response_text IS NOT NULL)
      response_text: 'test',
    })
    if (responseError) throw new Error(`student_responses seed failed: ${responseError.message}`)

    // Create an FSRS card for studentA (cross-student isolation test, test 4).
    const { error: fsrsError } = await admin.from('fsrs_cards').insert({
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
    if (fsrsError) throw new Error(`fsrs_cards seed failed: ${fsrsError.message}`)

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
    await cleanupReferenceData({ admin, refs: [refsA] })
  })

  it('student in orgB cannot read orgA questions', async () => {
    // Positive control: admin confirms the questions exist and are readable via service role.
    const { data: adminData, error: adminError } = await admin
      .from('questions')
      .select('id')
      .in('id', questionIdsA)
    expect(adminError).toBeNull()
    expect(adminData?.length).toBeGreaterThan(0)

    // Negative: orgB student is blocked by RLS.
    const { data, error } = await studentBClient
      .from('questions')
      .select('id')
      .in('id', questionIdsA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('student in orgB cannot read orgA quiz sessions', async () => {
    // Positive control via service role, matching the questions/student_responses tests
    // above: a self-read regression in quiz_sessions RLS would otherwise redden the control
    // rather than the negative below, making the failure signal ambiguous.
    const { data: adminData, error: adminError } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('id', sessionAId)
    expect(adminError).toBeNull()
    expect(adminData?.length).toBeGreaterThan(0)

    // Negative: orgB student is blocked by RLS.
    const { data, error } = await studentBClient
      .from('quiz_sessions')
      .select('id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('student in orgB cannot read orgA student responses', async () => {
    // Positive control: admin confirms the seeded student_response exists.
    const { data: adminData, error: adminError } = await admin
      .from('student_responses')
      .select('id')
      .eq('organization_id', orgAId)
    expect(adminError).toBeNull()
    expect(adminData?.length).toBeGreaterThan(0)

    // Negative: orgB student is blocked by RLS.
    const { data, error } = await studentBClient
      .from('student_responses')
      .select('id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('student cannot read another student FSRS cards (same org)', async () => {
    // Positive control: studentA can read their own card seeded in beforeAll.
    const { data: ownCards, error: ownError } = await studentAClient.from('fsrs_cards').select('id')
    expect(ownError).toBeNull()
    expect(ownCards?.length).toBeGreaterThan(0)

    // Negative: studentA2 has no cards — RLS returns only the requester's own rows.
    const { data, error } = await studentA2Client.from('fsrs_cards').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('student can read only their own audit events (GDPR Art. 15)', async () => {
    const { data, error } = await studentAClient.from('audit_events').select('id, actor_id')
    // Migration 060: students can now read their own audit events via audit_read_own policy
    // (actor_id = auth.uid()). start_quiz_session creates at least one event for the actor.
    expect(error).toBeNull()
    // Positive control: the query must return at least one row so the set-size check is non-vacuous.
    expect(data?.length).toBeGreaterThan(0)
    const actorIds = new Set((data ?? []).map((r) => r.actor_id))
    // Rows carry exactly the requester's actor_id — RLS enforces actor_id = auth.uid().
    // Pinning the identity, not just the set size: size === 1 passes for ANY single actor.
    expect(Array.from(actorIds)).toEqual([studentAId])
  })

  it('instructor can read audit events in own org', async () => {
    const { data, error } = await instructorAClient
      .from('audit_events')
      .select('id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('student can only see own quiz sessions (same org)', async () => {
    // studentA2 has no sessions
    const { data, error } = await studentA2Client.from('quiz_sessions').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    // studentA has 1 session
    const { data: dataA, error: errorA } = await studentAClient.from('quiz_sessions').select('id')
    expect(errorA).toBeNull()
    expect(dataA?.length).toBeGreaterThan(0)
  })
})
