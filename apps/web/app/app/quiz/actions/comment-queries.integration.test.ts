// App-layer integration tier (#925) — fetchQuestionComments against real Postgres under real RLS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
} from '@/lib/integration-support/harness'
import { fetchQuestionComments } from './comment-queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-comments-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let studentId: string
let refs: ReferenceIds
let commentedQuestionId: string
let emptyQuestionId: string
let studentClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

async function insertComment(body: string, deletedAt: string | null) {
  const { error } = await admin.from('question_comments').insert({
    question_id: commentedQuestionId,
    user_id: studentId,
    body,
    deleted_at: deletedAt,
  })
  if (error) throw new Error(`seed comment: ${error.message}`)
}

describe('fetchQuestionComments (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-comments ${suffix}`,
      slug: `int-comments-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `CMT_${suffix}`,
      subjectName: `Comments Subject ${suffix}`,
      topicCode: `CMT_${suffix}_T1`,
      topicName: `Comments Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 2,
    })
    const [withComments, withoutComments] = seeded.questionIds
    if (!withComments || !withoutComments) throw new Error('seedQuestions returned < 2 ids')
    commentedQuestionId = withComments
    emptyQuestionId = withoutComments

    await insertComment(`live ${suffix}`, null)
    await insertComment(`removed ${suffix}`, new Date().toISOString())
    studentClient = await getAuthenticatedClient({ email, password })
  })

  afterAll(async () => {
    const errors: string[] = []
    const comments = await admin.from('question_comments').delete().eq('user_id', studentId)
    if (comments.error) errors.push(`question_comments: ${comments.error.message}`)
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns the live comment with its author embedded and omits the deleted one', async () => {
    const { data, error } = await fetchQuestionComments(studentClient, commentedQuestionId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]?.body).toBe(`live ${suffix}`)
    expect(data[0]?.users).toEqual({ full_name: expect.any(String), role: 'student' })
  })

  it('omits a soft-deleted comment even for a reader that row-level security does not filter', async () => {
    const stored = await admin
      .from('question_comments')
      .select('id')
      .eq('question_id', commentedQuestionId)
    expect(stored.error).toBeNull()
    expect(stored.data).toHaveLength(2)

    const { data, error } = await fetchQuestionComments(admin, commentedQuestionId)

    expect(error).toBeNull()
    expect(data.map((c) => c.body)).toEqual([`live ${suffix}`])
  })

  it('returns an empty list without an error for a question with no comments', async () => {
    const { data, error } = await fetchQuestionComments(studentClient, emptyQuestionId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
