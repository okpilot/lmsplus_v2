// New query sites: exam_configs, easa_topics, easa_subtopics (real local Postgres, real RLS).
import {
  cleanupTestData,
  createPart3Org,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type Part3Org,
  startPart3Exam,
} from '@repo/db/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureSuffix, signInAs } from '@/lib/integration-support/harness'
import { getVfrRtExamQuestionCount } from './vfr-rt-exam-question-count'

const suffix = fixtureSuffix().slice(0, 6)
const admin = getAdminClient()
const PASSWORD = 'test-pass-123'
let org: Part3Org
let session: Awaited<ReturnType<typeof startPart3Exam>>
let bareOrgId: string
let bareStudentId: string
const bareEmail = `student-rtqc-${suffix}@test.local`

describe('getVfrRtExamQuestionCount (app-layer integration)', () => {
  beforeAll(async () => {
    org = await createPart3Org(`qc${suffix}`)
    session = await startPart3Exam(org)
    bareOrgId = await createTestOrg({
      admin,
      name: `RT QC bare ${suffix}`,
      slug: `rt-qc-bare-${suffix}`,
    })
    bareStudentId = await createTestUser({
      admin,
      orgId: bareOrgId,
      email: bareEmail,
      password: PASSWORD,
      role: 'student',
    })
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await org?.cleanup()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (bareOrgId) {
        await cleanupTestData({
          admin,
          orgId: bareOrgId,
          userIds: bareStudentId ? [bareStudentId] : [],
        })
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('equals the number of questions a started exam actually draws', async () => {
    await signInAs(org.studentEmail, org.studentPassword)
    const count = await getVfrRtExamQuestionCount(org.rtSubjectId)
    expect(session.question_ids.length).toBeGreaterThan(0)
    expect(count).toBe(session.question_ids.length)
  })

  it('equals 8 + 9 + 2 per Part 3 subtopic', async () => {
    const { count, error } = await admin
      .from('easa_subtopics')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', org.p3TopicId)
    if (error) throw new Error(error.message)
    await signInAs(org.studentEmail, org.studentPassword)
    expect(count).toBeGreaterThan(0)
    expect(await getVfrRtExamQuestionCount(org.rtSubjectId)).toBe(8 + 9 + 2 * (count ?? 0))
  })

  it('returns null for a student whose org has no enabled exam config', async () => {
    await signInAs(org.studentEmail, org.studentPassword)
    expect(await getVfrRtExamQuestionCount(org.rtSubjectId)).not.toBeNull()
    await signInAs(bareEmail, PASSWORD)
    expect(await getVfrRtExamQuestionCount(org.rtSubjectId)).toBeNull()
  })
})
