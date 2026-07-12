// App-layer integration tier (#925) — the regression test that the original
// `.is('deleted_at', null)` bug would have FAILED.
//
// `getRtSubjectData()` reads the canonical RT subject (seeded by migration 097,
// `code = 'RT'`) and its topics/subtopics server-side, so the RSC (VfrRtSetup)
// can seed the reused quiz topic-tree hook with initial state instead of a
// client mount-time fetch. The original bug filtered `easa_subjects` on a
// `deleted_at` column the table does not have, erroring at runtime so the
// whole call threw. A mocked unit test can't see that; this runs the real
// helper chain against real Postgres under real RLS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRtSubjectData } from '@/app/app/vfr-rt/actions/get-rt-subject'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  seedQuestions,
  signInAs,
} from '@/lib/integration-support/harness'

const admin = getAdminClient()
const suffix = Date.now()
const email = `int-rt-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let studentId: string
let rtSubjectId: string

describe('getRtSubjectData (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-rt ${suffix}`, slug: `int-rt-${suffix}` })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })

    // Canonical RT subject + Part 1/2/3 topics come from migration 097 — read, don't seed.
    const { data: subject, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id')
      .eq('code', 'RT')
      .single()
    if (subjErr || !subject) throw new Error(`RT subject lookup: ${subjErr?.message ?? 'missing'}`)
    rtSubjectId = subject.id

    // getTopicsWithSubtopics filters out topics with zero ACTIVE questions
    // (questionCount > 0), and migration 097 seeds the RT topics but NO question
    // rows — so on a migration-only CI DB every RT topic is filtered out and the
    // helper returns []. Seed one active question under a real RT topic so the
    // topic survives the filter. Org-scoped rows are torn down by cleanupTestData.
    const { data: topic, error: topicErr } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', rtSubjectId)
      .order('sort_order')
      .limit(1)
      .single()
    if (topicErr || !topic) throw new Error(`RT topic lookup: ${topicErr?.message ?? 'missing'}`)
    await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: rtSubjectId,
      topicId: topic.id,
      count: 1,
    })
  })

  afterAll(async () => {
    // Single org + its users — cleanupTestData handles FK-safe teardown (including
    // the org-scoped seeded question + bank). No easa_* reference rows were seeded.
    await cleanupTestData({ admin, orgId, userIds: [studentId] })
  })

  it('returns the canonical RT subject id', async () => {
    await signInAs(email, password)

    const result = await getRtSubjectData()

    // The subject lookup is what the deleted_at bug broke — under the bug this call threw.
    expect(result.id).toBe(rtSubjectId)
  })

  it('returns topics for the canonical RT subject', async () => {
    await signInAs(email, password)

    const result = await getRtSubjectData()

    // The RT topic seeded with an active question in beforeAll survives the
    // helper's questionCount > 0 filter, so at least one topic comes back.
    expect(result.topics.length).toBeGreaterThan(0)
  })
})
