// App-layer integration tier (#925) — real query helpers vs real Postgres under real RLS.
//
// Covers: getSubjectsWithCounts, getTopicsForSubject, getSubtopicsForTopic,
// getTopicsWithSubtopics — all four read paths in quiz-subject-queries.ts.
//
// Each helper calls get_question_counts() RPC which is org-scoped via RLS, so
// a fresh org sees only its own questions. The count-isolation test verifies
// that two orgs seeding questions under the SAME shared reference
// subject/topic each see only their OWN 3 questions (not 6 combined).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import {
  getSubjectsWithCounts,
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz-subject-queries'

const admin = getAdminClient()
const suffix = Date.now()

let orgAId: string
let studentAId: string
const emailA = `int-quiz-a-${suffix}@test.local`
const password = 'test-pass-123'

let orgBId: string
let studentBId: string
const emailB = `int-quiz-b-${suffix}@test.local`

let refs: ReferenceIds
// bankAId is captured so the draft-exclusion test can insert a raw question row
// with status='draft' into the same org+bank without going through seedQuestions.
let bankAId: string

describe('quiz-subject-queries (app-layer integration)', () => {
  beforeAll(async () => {
    // Org A + student A
    orgAId = await createTestOrg({
      admin,
      name: `int-quiz-a ${suffix}`,
      slug: `int-quiz-a-${suffix}`,
    })
    studentAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: emailA,
      password,
      role: 'student',
    })

    // Shared reference data (subject/topic/subtopic): only one set, both orgs seed
    // questions UNDER it so we can verify count-isolation.
    refs = await seedReferenceData({
      admin,
      subjectCode: `S${suffix}`,
      subjectName: `Integration Subject ${suffix}`,
      topicCode: `T${suffix}`,
      topicName: `Integration Topic ${suffix}`,
      subtopicCode: `ST${suffix}`,
      subtopicName: `Integration Subtopic ${suffix}`,
    })

    // Org A seeds 3 questions under the shared reference data.
    const { bankId } = await seedQuestions({
      admin,
      orgId: orgAId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 3,
    })
    bankAId = bankId

    // Insert 1 draft question in the same org/bank/topic so we can verify that
    // get_question_counts(p_status='active') excludes it.
    // cleanupTestData (afterAll step 1) hard-deletes all questions by org_id, so
    // this row is cleaned up without any extra step.
    const { error: draftErr } = await admin.from('questions').insert({
      organization_id: orgAId,
      bank_id: bankAId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: refs.subtopicId ?? null,
      question_text: 'Draft question — should not be counted',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
        { id: 'c', text: 'Option C' },
        { id: 'd', text: 'Option D' },
      ],
      correct_option_id: 'b',
      explanation_text: 'Draft explanation',
      difficulty: 'medium',
      status: 'draft',
      created_by: studentAId,
    })
    if (draftErr) throw new Error(`draft question insert: ${draftErr.message}`)

    // Org B + student B (for count-isolation test)
    orgBId = await createTestOrg({
      admin,
      name: `int-quiz-b ${suffix}`,
      slug: `int-quiz-b-${suffix}`,
    })
    studentBId = await createTestUser({
      admin,
      orgId: orgBId,
      email: emailB,
      password,
      role: 'student',
    })

    // Org B also seeds 3 questions under the SAME shared reference data.
    await seedQuestions({
      admin,
      orgId: orgBId,
      createdBy: studentBId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 3,
    })
  })

  afterAll(async () => {
    // 3 steps — per-step error accumulator (code-style §7).
    const errors: string[] = []

    // Step 1: clean up Org A's test data.
    try {
      await cleanupTestData({ admin, orgId: orgAId, userIds: [studentAId] })
    } catch (e) {
      errors.push(`cleanupTestData orgA: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Step 2: clean up Org B's test data.
    try {
      await cleanupTestData({ admin, orgId: orgBId, userIds: [studentBId] })
    } catch (e) {
      errors.push(`cleanupTestData orgB: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Step 3: clean up shared reference data — dependent on steps 1+2 (FK children
    // must be removed before we can remove the reference rows).
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) {
      throw new Error(`afterAll: ${errors.join('; ')}`)
    }
  })

  it('getSubjectsWithCounts includes the seeded subject with question count 3', async () => {
    await signInAs(emailA, password)

    const subjects = await getSubjectsWithCounts()

    const seeded = subjects.find((s) => s.id === refs.subjectId)
    expect(seeded).toBeDefined()
    expect(seeded?.questionCount).toBe(3)
  })

  it('getTopicsForSubject returns the seeded topic with question count 3', async () => {
    await signInAs(emailA, password)

    const topics = await getTopicsForSubject(refs.subjectId)

    const seeded = topics.find((t) => t.id === refs.topicId)
    expect(seeded).toBeDefined()
    expect(seeded?.questionCount).toBe(3)
  })

  it('getSubtopicsForTopic returns the seeded subtopic with question count 3', async () => {
    await signInAs(emailA, password)

    const subtopics = await getSubtopicsForTopic(refs.topicId)

    const seeded = subtopics.find((st) => st.id === refs.subtopicId)
    expect(seeded).toBeDefined()
    expect(seeded?.questionCount).toBe(3)
  })

  it('getTopicsWithSubtopics returns the topic with questionCount 3 containing the seeded subtopic', async () => {
    await signInAs(emailA, password)

    const topics = await getTopicsWithSubtopics(refs.subjectId)

    const seededTopic = topics.find((t) => t.id === refs.topicId)
    expect(seededTopic).toBeDefined()
    expect(seededTopic?.questionCount).toBe(3)

    const seededSubtopic = seededTopic?.subtopics.find((st) => st.id === refs.subtopicId)
    expect(seededSubtopic).toBeDefined()
    expect(seededSubtopic?.questionCount).toBe(3)
  })

  it('getTopicsForSubject returns each org only its own 3 questions when two orgs share reference data', async () => {
    // Both orgs seeded 3 questions under the SAME topic. get_question_counts is
    // org-scoped via RLS, so each org's student must see exactly its own 3, not
    // the combined 6. Proven from BOTH sides — a broken scope would return 6 to
    // whichever student is signed in, and the two-sided check ensures neither
    // org's view leaks the other's questions.
    await signInAs(emailA, password)
    const topicsA = await getTopicsForSubject(refs.subjectId)
    const seededA = topicsA.find((t) => t.id === refs.topicId)
    expect(seededA).toBeDefined()
    expect(seededA?.questionCount).toBe(3)

    await signInAs(emailB, password)
    const topicsB = await getTopicsForSubject(refs.subjectId)
    const seededB = topicsB.find((t) => t.id === refs.topicId)
    expect(seededB).toBeDefined()
    expect(seededB?.questionCount).toBe(3)
  })

  it('getSubjectsWithCounts excludes draft questions — count reflects only active questions', async () => {
    // beforeAll seeded 3 active + 1 draft for Org A under the test subject.
    // get_question_counts is called with p_status='active', so the draft must
    // not inflate the count. This is a real-DB integration assertion — unit
    // tests mock the RPC entirely and cannot verify the p_status WHERE clause.
    await signInAs(emailA, password)

    const subjects = await getSubjectsWithCounts()

    const seeded = subjects.find((s) => s.id === refs.subjectId)
    expect(seeded).toBeDefined()
    expect(seeded?.questionCount).toBe(3)
  })
})
