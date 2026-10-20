// App-layer integration tier (#925) — real query helpers vs real Postgres under real RLS.
//
// Covers: getDiscoveryCounts — the per-subject multiple-choice count preload. Its result for
// the seeded subject must equal what getFilteredCount (the action the form falls back to)
// returns for the Discovery defaults with the subject's full topic/subtopic ids. A short-answer
// question is seeded beside the multiple-choice ones so a dropped question-type filter shows.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getFilteredCount } from '@/app/app/quiz/actions/lookup'
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
import { getDiscoveryCounts } from '@/lib/queries/discovery-counts'
import { getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-dcounts-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let studentId: string
let refs: ReferenceIds

describe('getDiscoveryCounts (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-dcounts ${suffix}`,
      slug: `int-dcounts-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `S${suffix}`,
      subjectName: `DCounts Subject ${suffix}`,
      topicCode: `T${suffix}`,
      topicName: `DCounts Topic ${suffix}`,
      subtopicCode: `ST${suffix}`,
      subtopicName: `DCounts Subtopic ${suffix}`,
    })
    const { bankId } = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 3,
    })
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: refs.subtopicId ?? null,
      difficulty: 'medium',
      status: 'active',
      created_by: studentId,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: 'MAYDAY',
      explanation_text: 'SA explanation',
    })
    if (error) throw new Error(`short_answer insert: ${error.message}`)
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

  it('counts only the multiple-choice questions of the seeded subject', async () => {
    await signInAs(email, password)

    const counts = await getDiscoveryCounts()

    expect(counts[refs.subjectId]?.count).toBe(3)
    expect(counts[refs.subjectId]?.byTopic[refs.topicId]).toBe(3)
    expect(counts[refs.subjectId]?.bySubtopic[refs.subtopicId ?? '']).toBe(3)
  })

  it('equals the per-subject count action for the Discovery defaults with the full topic ids', async () => {
    await signInAs(email, password)
    const tree = await getTopicsWithSubtopics(refs.subjectId)
    expect(tree.length).toBeGreaterThan(0)

    const counts = await getDiscoveryCounts()
    const fromAction = await getFilteredCount({
      subjectId: refs.subjectId,
      topicIds: tree.map((t) => t.id),
      subtopicIds: tree.flatMap((t) => t.subtopics.map((st) => st.id)),
      filters: ['all'],
      calcMode: 'all',
      imageMode: 'all',
      questionType: 'multiple_choice',
    })

    expect(fromAction.count).toBeGreaterThan(0)
    expect(counts[refs.subjectId]).toEqual({
      count: fromAction.count,
      byTopic: fromAction.byTopic,
      bySubtopic: fromAction.bySubtopic,
    })
  })
})
