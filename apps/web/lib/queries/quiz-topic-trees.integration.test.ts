// App-layer integration tier (#925) — real query helpers vs real Postgres under real RLS.
//
// Covers: getAllTopicTrees — the all-subjects topic/subtopic read that preloads the quiz
// setup form. The seeded subject's tree must equal what the per-subject helper
// (getTopicsWithSubtopics) returns, so the preload and the fallback path agree.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'
import { getAllTopicTrees } from '@/lib/queries/quiz-topic-trees'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-trees-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let studentId: string
let refs: ReferenceIds

describe('getAllTopicTrees (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-trees ${suffix}`, slug: `int-trees-${suffix}` })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `S${suffix}`,
      subjectName: `Trees Subject ${suffix}`,
      topicCode: `T${suffix}`,
      topicName: `Trees Topic ${suffix}`,
      subtopicCode: `ST${suffix}`,
      subtopicName: `Trees Subtopic ${suffix}`,
    })
    await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 3,
    })
  })

  afterAll(async () => {
    const errors: string[] = []
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

  it('returns the seeded subject with its topic and subtopic question counts', async () => {
    await signInAs(email, password)

    const trees = await getAllTopicTrees()

    const tree = trees[refs.subjectId]
    expect(tree).toBeDefined()
    const topic = tree?.find((t) => t.id === refs.topicId)
    expect(topic?.questionCount).toBe(3)
    expect(topic?.subtopics.find((st) => st.id === refs.subtopicId)?.questionCount).toBe(3)
  })

  it('returns the same tree as the per-subject helper for the seeded subject', async () => {
    await signInAs(email, password)

    const trees = await getAllTopicTrees()
    const single = await getTopicsWithSubtopics(refs.subjectId)

    expect(single.length).toBeGreaterThan(0)
    expect(trees[refs.subjectId]).toEqual(single)
  })
})
