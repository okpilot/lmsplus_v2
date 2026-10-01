// New rpc site: get_vfr_rt_exam_questions (real local Postgres, real RLS).
import { createPart3Org, type Part3Org, startPart3Exam } from '@repo/db/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureSuffix, signInAs } from '@/lib/integration-support/harness'
import { loadVfrRtExamQuestions } from './load-vfr-rt-exam-questions'

const suffix = fixtureSuffix()
let org: Part3Org
let otherOrg: Part3Org
let session: Awaited<ReturnType<typeof startPart3Exam>>

describe('loadVfrRtExamQuestions (app-layer integration)', () => {
  beforeAll(async () => {
    org = await createPart3Org(`lq${suffix}`)
    otherOrg = await createPart3Org(`lr${suffix}`)
    session = await startPart3Exam(org)
  })

  afterAll(async () => {
    const errors: string[] = []
    for (const o of [org, otherOrg]) {
      try {
        await o?.cleanup()
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns the session questions in the frozen question order', async () => {
    await signInAs(org.studentEmail, org.studentPassword)
    const result = await loadVfrRtExamQuestions({ sessionId: session.session_id })
    if (!result.success) throw new Error(result.error)
    expect(result.questions.length).toBeGreaterThan(0)
    expect(result.questions.map((q) => q.id)).toEqual(session.question_ids)
  })

  it('carries no explanation values', async () => {
    await signInAs(org.studentEmail, org.studentPassword)
    const result = await loadVfrRtExamQuestions({ sessionId: session.session_id })
    if (!result.success) throw new Error(result.error)
    expect(result.questions.length).toBeGreaterThan(0)
    for (const q of result.questions) {
      expect(q.explanation_text).toBeNull()
      expect(q.explanation_image_url).toBeNull()
    }
  })

  it('delivers ordering items and a diagram config without the answer key', async () => {
    await signInAs(org.studentEmail, org.studentPassword)
    const result = await loadVfrRtExamQuestions({ sessionId: session.session_id })
    if (!result.success) throw new Error(result.error)
    const ordering = result.questions.filter((q) => q.question_type === 'ordering')
    const diagram = result.questions.find((q) => q.question_type === 'diagram_label')
    expect(ordering.length).toBeGreaterThan(0)
    for (const q of ordering) expect(q.ordering_items?.length).toBeGreaterThanOrEqual(2)
    expect(diagram?.diagram_config?.zones.length).toBeGreaterThan(0)
    expect(diagram?.diagram_config).not.toHaveProperty('answer')
  })

  it("fails for another student's session", async () => {
    const own = await startPart3Exam(otherOrg)
    await signInAs(otherOrg.studentEmail, otherOrg.studentPassword)
    const control = await loadVfrRtExamQuestions({ sessionId: own.session_id })
    expect(control.success).toBe(true)
    const result = await loadVfrRtExamQuestions({ sessionId: session.session_id })
    expect(result).toEqual({ success: false, error: 'Failed to load questions. Please try again.' })
  })

  it('fails for a non-uuid session id', async () => {
    await signInAs(org.studentEmail, org.studentPassword)
    const result = await loadVfrRtExamQuestions({ sessionId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})
