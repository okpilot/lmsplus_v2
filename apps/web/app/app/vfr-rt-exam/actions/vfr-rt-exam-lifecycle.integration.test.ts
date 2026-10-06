// App-layer integration tier — VFR RT mock exam cross-action lifecycle.
// Real start -> load -> save answers -> finish chain against real Postgres under real RLS.
import { createPart3Org, type Part3Org } from '@repo/db/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import { finishQuizSession } from '@/app/app/quiz/actions/finish'
import { claimQuizSession, saveQuizAnswer } from '@/app/app/quiz/actions/quiz-progress'
import { fixtureSuffix, getAdminClient, signInAs } from '@/lib/integration-support/harness'
import { loadVfrRtExamQuestions } from '@/lib/queries/load-vfr-rt-exam-questions'
import { startVfrRtExam } from './start'

const admin = getAdminClient()
const suffix = fixtureSuffix().slice(0, 6)
const DEVICE = '00000000-0000-4000-a000-00000000aaa1'
let org: Part3Org

/** An answer in the shape saveQuizAnswer accepts for the question's type. */
function answerFor(q: SessionQuestion) {
  switch (q.question_type) {
    case 'short_answer':
      return { responseText: 'alpha' }
    case 'dialog_fill':
      return { blankAnswers: (q.blanks_safe ?? []).map((b) => ({ index: b.index, text: 'x' })) }
    case 'ordering':
      return { order: (q.ordering_items ?? []).map((i) => i.id) }
    case 'diagram_label': {
      const zones = q.diagram_config?.zones ?? []
      const labels = q.diagram_config?.labels ?? []
      return {
        mapping: zones.slice(0, 2).map((z, i) => ({ zoneId: z.id, labelId: labels[i]?.id ?? '' })),
      }
    }
    default:
      return { selectedOptionId: q.options[0]?.id }
  }
}

async function saveAnswerFor(sessionId: string, q: SessionQuestion) {
  const result = await saveQuizAnswer({
    sessionId,
    questionId: q.id,
    deviceId: DEVICE,
    answer: answerFor(q),
    timeSpentMs: 1000,
  })
  if (!result.success) throw new Error(`save ${q.question_type}: ${result.error}`)
}

async function startAndLoad() {
  await signInAs(org.studentEmail, org.studentPassword)
  const started = await startVfrRtExam({ subjectId: org.rtSubjectId })
  if (!started.success) throw new Error(started.error)
  const loaded = await loadVfrRtExamQuestions({ sessionId: started.sessionId })
  if (!loaded.success) throw new Error(loaded.error)
  const claimed = await claimQuizSession({ sessionId: started.sessionId, deviceId: DEVICE })
  if (!claimed.success) throw new Error(claimed.error)
  return { sessionId: started.sessionId, questions: loaded.questions }
}

async function endedAt(sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('ended_at')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(error.message)
  return data.ended_at
}

describe('VFR RT mock exam lifecycle (app-layer integration)', () => {
  beforeAll(async () => {
    org = await createPart3Org(`lc${suffix}`)
  })

  afterAll(async () => {
    await org?.cleanup()
  })

  it('ends the session after saving an answer of every delivered type', async () => {
    const { sessionId, questions } = await startAndLoad()
    const types = new Set(questions.map((q) => q.question_type))
    for (const t of ['short_answer', 'dialog_fill', 'multiple_choice', 'ordering', 'diagram_label'])
      expect(types.has(t as SessionQuestion['question_type'])).toBe(true)
    expect(await endedAt(sessionId)).toBeNull()

    for (const q of questions) await saveAnswerFor(sessionId, q)

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE })).toEqual({ success: true })
    expect(await endedAt(sessionId)).not.toBeNull()
  })

  it('still ends the session when one question was never answered', async () => {
    const { sessionId, questions } = await startAndLoad()
    const ordering = questions.find((q) => (q.ordering_items?.length ?? 0) >= 2)
    if (!ordering) throw new Error('no ordering question delivered')
    const answered = questions.filter((q) => q.id !== ordering.id)
    expect(answered.length).toBeGreaterThan(0)
    for (const q of answered) await saveAnswerFor(sessionId, q)

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE })).toEqual({ success: true })
    expect(await endedAt(sessionId)).not.toBeNull()
  })

  it('ends a fresh exam with no saved answers', async () => {
    const { sessionId } = await startAndLoad()

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE })).toEqual({ success: true })
    expect(await endedAt(sessionId)).not.toBeNull()
  })
})
