// App-layer integration tier (#925, #931) — mock_exam cross-action lifecycle.
//
// Exercises the real startExamSession → saveQuizAnswer → finishQuizSession flow against real
// Postgres under real RLS. finish_quiz_session IS the mock_exam completion: it grades the
// saved answers and ends the session. The per-source integration tests cover exam START
// (start-exam.integration.test.ts) and finish on a quick_quiz session
// (finish.integration.test.ts); this is the one case that connects a genuine mock_exam
// session's pass_mark gating and score/passed contract end to end.
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
import { finishQuizSession } from './finish'
import { claimQuizSession, saveQuizAnswer } from './quiz-progress'
import { startExamSession } from './start-exam'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let studentAId: string
let studentBId: string
let studentCId: string
const emailA = `int-exam-lifecycle-a-${suffix}@test.local`
const emailB = `int-exam-lifecycle-b-${suffix}@test.local`
const emailC = `int-exam-lifecycle-c-${suffix}@test.local`
const password = 'test-pass-123'
const DEVICE = '00000000-0000-4000-a000-00000000aaa1'

let refs: ReferenceIds
let seededQuestionIds: string[]

type Pick = 'a' | 'b'

/** Claims the session, saves one answer per entry in question order, then finishes it. */
async function answerAndFinish(sessionId: string, questionIds: string[], picks: Pick[]) {
  const claimed = await claimQuizSession({ sessionId, deviceId: DEVICE })
  expect(claimed).toEqual({ success: true })
  for (const [i, pick] of picks.entries()) {
    const saved = await saveQuizAnswer({
      sessionId,
      questionId: questionIds[i],
      deviceId: DEVICE,
      answer: { selectedOptionId: pick },
      timeSpentMs: 1500,
    })
    expect(saved).toEqual({ success: true })
  }
  expect(await finishQuizSession({ sessionId, deviceId: DEVICE })).toEqual({ success: true })
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('ended_at, correct_count, score_percentage, passed')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`session row: ${error.message}`)
  return data
}

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

    studentCId = await createTestUser({
      admin,
      orgId,
      email: emailC,
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
    if (!config) throw new Error('exam_configs insert: no row returned')

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
      await cleanupTestData({ admin, orgId, userIds: [studentAId, studentBId, studentCId] })
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
    // startExamSession (real mock_exam session) → save all 3 → finishQuizSession.
    // All seeded questions have correct_option_id='b', so 'b' is always correct, 'a' wrong.
    await signInAs(emailA, password)

    const started = await startExamSession({ subjectId: refs.subjectId })
    expect(started.success).toBe(true)
    if (!started.success) throw new Error(started.error)
    expect(typeof started.sessionId).toBe('string')
    expect(started.sessionId).toBeTruthy()
    expect(started.questionIds).toHaveLength(3)
    expect([...started.questionIds].sort()).toEqual([...seededQuestionIds].sort())

    // 2 correct ('b') + 1 wrong ('a') over a 3-question exam → 66.67%, pass_mark 50.
    const row = await answerAndFinish(started.sessionId, started.questionIds, ['b', 'b', 'a'])

    expect(row.ended_at).not.toBeNull()
    expect(row.correct_count).toBe(2)
    // mock_exam score = round(correct/total*100, 2) = 66.67%.
    expect(Number(row.score_percentage)).toBeCloseTo(66.67, 1)
    // Real mock_exam session: passed is a true boolean (66.67% ≥ 50, all answered),
    // not the quick_quiz null.
    expect(row.passed).toBe(true)
  })

  it('completes a failing mock_exam: 1 of 3 correct → 33.33%, not passed', async () => {
    await signInAs(emailB, password)

    const started = await startExamSession({ subjectId: refs.subjectId })
    expect(started.success).toBe(true)
    if (!started.success) throw new Error(started.error)
    expect(started.questionIds).toHaveLength(3)

    // 1 correct ('b') + 2 wrong ('a') over a 3-question exam → 33.33%, below pass_mark 50.
    const row = await answerAndFinish(started.sessionId, started.questionIds, ['b', 'a', 'a'])

    expect(row.ended_at).not.toBeNull()
    expect(row.correct_count).toBe(1)
    expect(Number(row.score_percentage)).toBeCloseTo(33.33, 1)
    expect(row.passed).toBe(false)
  })

  it('fails a partial mock_exam even when answered questions are all correct', async () => {
    // Anti-cheat invariant unique to mock_exam: answering only a subset forces passed=false
    // regardless of accuracy, and the score uses the /total denominator — so 2-of-3
    // answered-and-correct is 66.67% (not 100%) and NOT a pass, even though 66.67% ≥ pass_mark 50.
    await signInAs(emailC, password)

    const started = await startExamSession({ subjectId: refs.subjectId })
    expect(started.success).toBe(true)
    if (!started.success) throw new Error(started.error)
    expect(started.questionIds).toHaveLength(3)

    // Save only 2 of the 3 questions, both correct ('b').
    const row = await answerAndFinish(started.sessionId, started.questionIds, ['b', 'b'])

    expect(row.ended_at).not.toBeNull()
    expect(row.correct_count).toBe(2)
    // Score is correct/TOTAL (2/3 = 66.67%), not correct/answered (2/2 = 100%).
    expect(Number(row.score_percentage)).toBeCloseTo(66.67, 1)
    // 66.67% ≥ pass_mark 50, but the mock_exam all-answered requirement forces a fail.
    expect(row.passed).toBe(false)
  })
})
