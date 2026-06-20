// App-layer integration tier (#925) — the regression test that the original
// `.is('deleted_at', null)` bug would have FAILED.
//
// `getRtSubjectData()` reads the canonical RT subject (seeded by migration 097,
// `code = 'RT'`) and its parts (topics) with org-scoped question counts. The bug
// filtered `easa_subjects` on a `deleted_at` column the table does not have,
// erroring at runtime so the whole call threw. A mocked unit test can't see
// that; this runs the real helper chain against real Postgres under real RLS.
//
// Per plan-critic suggestion #2: the action hard-codes `.eq('code','RT')`, so
// this reads the migration-seeded canonical RT row (it does NOT seed its own
// `easa_*` rows — that would upsert-collide with reference data). It seeds a
// throwaway org + student, then active RT questions under one canonical RT
// topic so that part survives the `questionCount > 0` filter in
// getTopicsWithSubtopics (counts are org-scoped, so a fresh org sees zero parts
// until it has its own questions).
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
const SEEDED_PART = 'P1_ACRONYMS'

let orgId: string
let studentId: string
let rtSubjectId: string

describe('getRtSubjectData (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-rt ${suffix}`, slug: `int-rt-${suffix}` })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })

    // Canonical RT subject + its parts come from migration 097 — read, don't seed.
    const { data: subject, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id')
      .eq('code', 'RT')
      .single()
    if (subjErr || !subject) throw new Error(`RT subject lookup: ${subjErr?.message ?? 'missing'}`)
    rtSubjectId = subject.id

    const { data: topic, error: topicErr } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', rtSubjectId)
      .eq('code', SEEDED_PART)
      .single()
    if (topicErr || !topic) throw new Error(`RT topic lookup: ${topicErr?.message ?? 'missing'}`)

    // Active questions for THIS org under the canonical RT topic so the part is
    // counted (>0) and therefore delivered by getTopicsWithSubtopics.
    await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: rtSubjectId,
      topicId: topic.id,
      subtopicId: null,
      count: 3,
    })
  })

  afterAll(async () => {
    // Single org + its users (+ the questions/bank seeded under it) — cleanupTestData
    // handles FK-safe teardown. No easa_* reference rows were seeded.
    await cleanupTestData({ admin, orgId, userIds: [studentId] })
  })

  it('returns the canonical RT subject and the part it has questions for', async () => {
    await signInAs(email, password)

    const result = await getRtSubjectData()

    // The subject lookup is what the deleted_at bug broke — under the bug this call threw.
    expect(result.id).toBe(rtSubjectId)
    // The seeded part survives the org-scoped questionCount > 0 filter.
    expect(result.parts.map((p) => p.code)).toContain(SEEDED_PART)
    const seeded = result.parts.find((p) => p.code === SEEDED_PART)
    expect(seeded?.questionCount).toBe(3)
  })
})
