// App-layer integration tier — VFR RT mock exam cross-action lifecycle.
// Real start -> load -> payload -> submit chain against real Postgres under real RLS.
import { createPart3Org, type Part3Org } from '@repo/db/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import { submitEmptyExamSession } from '@/app/app/quiz/actions/submit-empty-exam'
import type { DraftAnswer } from '@/app/app/quiz/types'
import { fixtureSuffix, getAdminClient, signInAs } from '@/lib/integration-support/harness'
import { loadVfrRtExamQuestions } from '@/lib/queries/load-vfr-rt-exam-questions'
import { buildVfrRtExamPayload } from '../_utils/build-vfr-rt-exam-payload'
import { startVfrRtExam } from './start'
import { submitVfrRtExam } from './submit'

const admin = getAdminClient()
const suffix = fixtureSuffix().slice(0, 6)
let org: Part3Org

function answerFor(q: SessionQuestion): DraftAnswer {
  const responseTimeMs = 1000
  switch (q.question_type) {
    case 'short_answer':
      return { responseText: 'alpha', responseTimeMs }
    case 'dialog_fill':
      return {
        blankAnswers: (q.blanks_safe ?? []).map((b) => ({ index: b.index, text: 'x' })),
        responseTimeMs,
      }
    case 'ordering':
      return { order: (q.ordering_items ?? []).map((i) => i.id), responseTimeMs }
    case 'diagram_label': {
      const zones = q.diagram_config?.zones ?? []
      const labels = q.diagram_config?.labels ?? []
      return {
        mapping: zones.slice(0, 2).map((z, i) => ({ zoneId: z.id, labelId: labels[i]?.id ?? '' })),
        responseTimeMs,
      }
    }
    default:
      return { selectedOptionId: q.options[0]?.id, responseTimeMs }
  }
}

async function startAndLoad() {
  await signInAs(org.studentEmail, org.studentPassword)
  const started = await startVfrRtExam({ subjectId: org.rtSubjectId })
  if (!started.success) throw new Error(started.error)
  const loaded = await loadVfrRtExamQuestions({ sessionId: started.sessionId })
  if (!loaded.success) throw new Error(loaded.error)
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

  it('ends the session and points at the report after answering every delivered type', async () => {
    const { sessionId, questions } = await startAndLoad()
    const types = new Set(questions.map((q) => q.question_type))
    for (const t of ['short_answer', 'dialog_fill', 'multiple_choice', 'ordering', 'diagram_label'])
      expect(types.has(t as SessionQuestion['question_type'])).toBe(true)

    const answers = new Map(questions.map((q) => [q.id, answerFor(q)]))
    const payload = buildVfrRtExamPayload(answers, questions)
    expect(payload.length).toBeGreaterThan(0)

    const result = await submitVfrRtExam({ sessionId, answers: payload })
    if (!result.success) throw new Error(result.error)
    expect(result.redirect_to).toBe(`/app/vfr-rt/report?session=${sessionId}`)
    expect(await endedAt(sessionId)).not.toBeNull()
  })

  it('drops a question with an incomplete ordering answer and still submits the rest', async () => {
    const { sessionId, questions } = await startAndLoad()
    const ordering = questions.find((q) => (q.ordering_items?.length ?? 0) >= 2)
    if (!ordering) throw new Error('no ordering question delivered')
    const answers = new Map(questions.map((q) => [q.id, answerFor(q)]))
    answers.set(ordering.id, {
      order: (ordering.ordering_items ?? []).slice(0, 1).map((i) => i.id),
      responseTimeMs: 1000,
    })

    const payload = buildVfrRtExamPayload(answers, questions)
    expect(payload.some((e) => e.questionId === ordering.id)).toBe(false)
    expect(payload.some((e) => e.questionId !== ordering.id)).toBe(true)

    const result = await submitVfrRtExam({ sessionId, answers: payload })
    if (!result.success) throw new Error(result.error)
    expect(await endedAt(sessionId)).not.toBeNull()
  })

  it('completes a fresh exam with no answers through the empty-exam path', async () => {
    const { sessionId, questions } = await startAndLoad()
    expect(buildVfrRtExamPayload(new Map(), questions)).toHaveLength(0)

    const result = await submitEmptyExamSession({ sessionId })
    expect(result.success).toBe(true)
    expect(await endedAt(sessionId)).not.toBeNull()
  })
})
