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

describe('RPC: get_quiz_questions', () => {
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
      name: `Test Org GetQ ${suffix}`,
      slug: `test-getq-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-getq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-getq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-getq-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `T${suffix}`,
      subjectName: `Test Subject ${suffix}`,
      topicCode: `T${suffix}-01`,
      topicName: `Test Topic ${suffix}`,
      subtopicCode: `T${suffix}-01-01`,
      subtopicName: `Test Subtopic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 3,
    })
    questionIds = seeded.questionIds
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  it('strips correct field from options', async () => {
    const { data, error } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: questionIds,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)

    for (const q of data ?? []) {
      const options = q.options as Array<Record<string, unknown>>
      for (const opt of options) {
        expect(opt).toHaveProperty('id')
        expect(opt).toHaveProperty('text')
        expect(opt).not.toHaveProperty('correct')
      }
    }
  })

  it('returns explanation fields from questions table', async () => {
    const { data, error } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: questionIds,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(questionIds.length)

    for (const q of data ?? []) {
      expect(typeof q.explanation_text).toBe('string')
      expect(q.explanation_image_url).toBeNull()
    }
  })

  it('filters out deleted questions', async () => {
    // Soft-delete one question
    await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', questionIds[0])

    const { data } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: questionIds,
    })
    expect(data).toHaveLength(2)

    // Restore
    await admin.from('questions').update({ deleted_at: null }).eq('id', questionIds[0])
  })

  it('filters out draft questions', async () => {
    await admin.from('questions').update({ status: 'draft' }).eq('id', questionIds[1])

    const { data } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: questionIds,
    })
    expect(data).toHaveLength(2)

    // Restore
    await admin.from('questions').update({ status: 'active' }).eq('id', questionIds[1])
  })

  it('returns empty for non-existent IDs', async () => {
    const { data, error } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: ['00000000-0000-0000-0000-000000000001'],
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('joins subject/topic/subtopic correctly', async () => {
    const { data } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: [questionIds[0]],
    })
    expect(data).toHaveLength(1)
    expect(data?.[0].subject_code).toBe(`T${suffix}`)
    expect(data?.[0].topic_name).toBe(`Test Topic ${suffix}`)
    expect(data?.[0].subtopic_name).toBe(`Test Subtopic ${suffix}`)
  })
})
