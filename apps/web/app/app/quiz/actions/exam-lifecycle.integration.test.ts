// App-layer integration tier (#925, #931) — mock_exam cross-action lifecycle.
//
// Exercises the real startExamSession → batchSubmitQuiz flow against real Postgres
// under real RLS. batch_submit_quiz IS the mock_exam completion: it ends the
// session and returns the score/passed contract. The per-source integration tests
// cover exam START (start-exam.integration.test.ts) and the quiz-mode batch path
// (batch-submit.integration.test.ts via seedOpenSession — a quick_quiz session that
// coalesces passed→null), but neither spans a real mock_exam start→submit→complete.
// This is the one case those tests don't connect: a genuine mock_exam session whose
// pass_mark gating and score/passed contract are exercised end to end.
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
import { batchSubmitQuiz } from './batch-submit'
import { startExamSession } from './start-exam'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-exam-lifecycle-a-${suffix}@test.local`
const emailB = `int-exam-lifecycle-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let seededQuestionIds: string[]

describe('mock_exam lifecycle (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-exam-lifecycle ${suffix}`,
      slug: `int-exam-lifecycle-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
    })

    studentBId = await createTestUser({
      admin,
      orgId,
      email: emailB,
      password,
      role: 'student',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `EXL_${suffix}`,
      subjectName: `Exam Lifecycle Subject ${suffix}`,
      topicCode: `EXL_${suffix}_T1`,
      topicName: `Exam Lifecycle Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    seededQuestionIds = seeded.questionIds

    const { data: config, error: configErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: refs.subjectId,
        enabled: true,
        total_questions: 3,
        time_limit_seconds: 3600,
        pass_mark: 50,
      })
      .select('id')
      .single()
    if (configErr) throw new Error(`exam_configs insert: ${configErr.message}`)

    const { error: distErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: config.id,
      topic_id: refs.topicId,
      subtopic_id: null,
      question_count: 3,
    })
    if (distErr) throw new Error(`exam_config_distributions insert: ${distErr.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId, studentBId] })
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

  it('completes a passing mock_exam: 2 of 3 correct → 66.67%, passed', async () => {
    // Full mock_exam lifecycle: startExamSession (real mock_exam session) → answer
    // all 3 → batchSubmitQuiz (ends the session, returns the score/passed contract).
    // All seeded questions have correct_option_id='b', so answer by position in the
    // RPC-returned questionIds array: 'b' is always correct, 'a' always wrong.
    await signInAs(emailA, password)

    const started = await startExamSession({ subjectId: refs.subjectId })
    expect(started.success).toBe(true)
    if (!started.success) throw new Error(started.error)
    expect(typeof started.sessionId).toBe('string')
    expect(started.sessionId).toBeTruthy()
    expect(started.questionIds).toHaveLength(3)
    expect(started.questionIds.sort()).toEqual([...seededQuestionIds].sort())

    // 2 correct ('b') + 1 wrong ('a') over a 3-question exam → 66.67%, pass_mark 50.
    const result = await batchSubmitQuiz({
      sessionId: started.sessionId,
      answers: [
        { questionId: started.questionIds[0], selectedOptionId: 'b', responseTimeMs: 1500 },
        { questionId: started.questionIds[1], selectedOptionId: 'b', responseTimeMs: 1500 },
        { questionId: started.questionIds[2], selectedOptionId: 'a', responseTimeMs: 1500 },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.totalQuestions).toBe(3)
    expect(result.answeredCount).toBe(3)
    expect(result.correctCount).toBe(2)
    // mock_exam score = round(correct/total*100, 2) = 66.67%.
    expect(result.scorePercentage).toBeCloseTo(66.67, 1)
    // Real mock_exam session: passed is a true boolean (66.67% ≥ 50, all answered),
    // not the quick_quiz null. expired is false on the fresh (non-timed-out) submit.
    expect(result.passed).toBe(true)
    expect(result.expired).toBe(false)
    // Lifecycle-level guard: one per-answer result row per submitted answer. The
    // sibling batch-submit test covers per-item shape; here we pin the count so a
    // silent empty-results regression can't pass the exam contract.
    expect(result.results).toHaveLength(3)
  })

  it('completes a failing mock_exam: 1 of 3 correct → 33.33%, not passed', async () => {
    await signInAs(emailB, password)

    const started = await startExamSession({ subjectId: refs.subjectId })
    expect(started.success).toBe(true)
    if (!started.success) throw new Error(started.error)
    expect(started.questionIds).toHaveLength(3)

    // 1 correct ('b') + 2 wrong ('a') over a 3-question exam → 33.33%, below pass_mark 50.
    const result = await batchSubmitQuiz({
      sessionId: started.sessionId,
      answers: [
        { questionId: started.questionIds[0], selectedOptionId: 'b', responseTimeMs: 1500 },
        { questionId: started.questionIds[1], selectedOptionId: 'a', responseTimeMs: 1500 },
        { questionId: started.questionIds[2], selectedOptionId: 'a', responseTimeMs: 1500 },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.totalQuestions).toBe(3)
    expect(result.answeredCount).toBe(3)
    expect(result.correctCount).toBe(1)
    // mock_exam score = round(1/3*100, 2) = 33.33%.
    expect(result.scorePercentage).toBeCloseTo(33.33, 1)
    expect(result.passed).toBe(false)
    expect(result.expired).toBe(false)
  })
})
