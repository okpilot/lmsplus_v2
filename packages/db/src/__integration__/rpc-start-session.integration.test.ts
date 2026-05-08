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
    // Previous expect guarantees events[0] exists
    expect(events![0]!.event_type).toBe('quiz_session.started')
    expect(events![0]!.resource_type).toBe('quiz_session')
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

describe('RPC: start_quiz_session input validation', () => {
  const admin = getAdminClient()
  let orgId: string
  let otherOrgId: string
  let adminUserId: string
  let otherAdminUserId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let otherRefs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const otherUserIds: string[] = []
  const suffix = `${Date.now()}-v`

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Validation ${suffix}`,
      slug: `test-validation-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-validation-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-validation-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-validation-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `SV${suffix}`,
      subjectName: `Validation Subject ${suffix}`,
      topicCode: `SV${suffix}-01`,
      topicName: `Validation Topic ${suffix}`,
    })

    // Second subject in the SAME org for the wrong-subject test
    otherRefs = await seedReferenceData({
      admin,
      subjectCode: `SV${suffix}-B`,
      subjectName: `Validation Subject B ${suffix}`,
      topicCode: `SV${suffix}-B-01`,
      topicName: `Validation Topic B ${suffix}`,
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

    // Separate org for cross-org test
    otherOrgId = await createTestOrg({
      admin,
      name: `Test Org Validation Other ${suffix}`,
      slug: `test-validation-other-${suffix}`,
    })
    otherAdminUserId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `admin-validation-other-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    otherUserIds.push(otherAdminUserId)
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  it('rejects an empty p_question_ids array with no_questions_provided', async () => {
    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('no_questions_provided')
  })

  it('rejects duplicate question UUIDs with invalid_question_ids', async () => {
    // Without this guard, total_questions counts duplicates while the answers
    // table only stores one row per question — the session would be unfinishable.
    // questionIds[0]! safe — seeded in beforeAll with count: N >= 1
    const dupId = questionIds[0]!
    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [dupId, dupId],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_ids')
  })

  it('rejects a non-existent question UUID with invalid_question_ids', async () => {
    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: ['00000000-0000-0000-0000-000000000000'],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_ids')
  })

  it('rejects a question whose subject does not match p_subject_id', async () => {
    // questionIds belong to refs.subjectId; pass otherRefs.subjectId as scope
    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: otherRefs.subjectId,
      p_topic_id: otherRefs.topicId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_ids')
  })

  it('rejects a soft-deleted question with invalid_question_ids', async () => {
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    // seedQuestions with count: 1 always returns one ID
    const softDeletedId = seeded.questionIds[0]!
    const { data: updData, error: updErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softDeletedId)
      .select('id')
    if (updErr) throw new Error(`soft-delete: ${updErr.message}`)
    if (!updData?.length) throw new Error('soft-delete: zero rows affected')

    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [softDeletedId],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_ids')
  })

  it('rejects an inactive (status=draft) question with invalid_question_ids', async () => {
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    // seedQuestions with count: 1 always returns one ID
    const draftId = seeded.questionIds[0]!
    const { data: updData, error: updErr } = await admin
      .from('questions')
      .update({ status: 'draft' })
      .eq('id', draftId)
      .select('id')
    if (updErr) throw new Error(`draft-update: ${updErr.message}`)
    if (!updData?.length) throw new Error('draft-update: zero rows affected')

    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [draftId],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_ids')
  })

  it('rejects a cross-org question with invalid_question_ids', async () => {
    // easa_subjects/easa_topics are shared global reference data (no
    // organization_id column), so reusing refs.subjectId/topicId here is
    // intentional — only the questions.organization_id mismatch should
    // trigger the rejection, not a subject/topic mismatch.
    const seeded = await seedQuestions({
      admin,
      orgId: otherOrgId,
      createdBy: otherAdminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    // seedQuestions with count: 1 always returns one ID
    const otherOrgQuestionId = seeded.questionIds[0]!

    const { error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [otherOrgQuestionId],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_ids')
  })

  it('allows smart_review with null subject and null topic (regression guard)', async () => {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })

  it('rejects p_mode=mock_exam with mode_not_allowed', async () => {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'mock_exam',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('mode_not_allowed')
    expect(data).toBeNull()
  })

  it('rejects p_mode=internal_exam with mode_not_allowed', async () => {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'internal_exam',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('mode_not_allowed')
    expect(data).toBeNull()
  })
})
