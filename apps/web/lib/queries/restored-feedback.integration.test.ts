// App-layer integration tier (#925) — getRestoredFeedback.
//
// Real get_restored_feedback under real RLS: camelCase feedback for answers the caller saved
// through the check RPCs, nothing for a stranger's session.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { seedOpenSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getRestoredFeedback } from './restored-feedback'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const ownerEmail = `int-rfb-owner-${suffix}@test.local`
const otherEmail = `int-rfb-other-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let ownerId: string
let otherId: string
let refs: ReferenceIds
let questionIds: string[]
let ownerClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let sessionId: string

describe('getRestoredFeedback (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-rfb ${suffix}`, slug: `int-rfb-${suffix}` })
    ownerId = await createTestUser({ admin, orgId, email: ownerEmail, password, role: 'student' })
    otherId = await createTestUser({ admin, orgId, email: otherEmail, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `RFB_${suffix}`,
      subjectName: `Restored Subject ${suffix}`,
      topicCode: `RFB_${suffix}_T1`,
      topicName: `Restored Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: ownerId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 2,
    })
    questionIds = seeded.questionIds
    ownerClient = await getAuthenticatedClient({ email: ownerEmail, password })
    const opened = await seedOpenSession({
      studentClient: ownerClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    sessionId = opened.sessionId
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await clearActiveSessions({ admin, studentIds: [ownerId] })
      await cleanupTestData({ admin, orgId, userIds: [ownerId, otherId] })
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

  it('returns camelCase feedback for an answered question and nothing for an unanswered one', async () => {
    const [answered, unanswered] = questionIds as [string, string]
    const { error } = await ownerClient.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: answered,
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: null,
    })
    expect(error).toBeNull()

    await signInAs(ownerEmail, password)
    const feedback = await getRestoredFeedback(sessionId)

    expect(Object.keys(feedback)).toEqual([answered])
    expect(feedback[answered]).toMatchObject({
      questionType: 'multiple_choice',
      isCorrect: false,
      correctOptionId: 'b',
    })
    expect(feedback[unanswered]).toBeUndefined()
  })

  it('returns nothing and logs for a session another student owns', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await signInAs(otherEmail, password)

    const feedback = await getRestoredFeedback(sessionId)

    expect(feedback).toEqual({})
    expect(errorSpy).toHaveBeenCalledWith(
      '[getRestoredFeedback] RPC error:',
      expect.stringContaining('session_not_found'),
    )
  })
})
