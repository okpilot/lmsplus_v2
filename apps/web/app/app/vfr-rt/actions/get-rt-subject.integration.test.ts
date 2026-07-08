// App-layer integration tier (#925) — the regression test that the original
// `.is('deleted_at', null)` bug would have FAILED.
//
// `getRtSubjectData()` reads the canonical RT subject (seeded by migration 097,
// `code = 'RT'`). The bug filtered `easa_subjects` on a `deleted_at` column the
// table does not have, erroring at runtime so the whole call threw. A mocked
// unit test can't see that; this runs the real helper chain against real
// Postgres under real RLS.
//
// Topics now load client-side via the reused quiz topic-tree hook
// (useLockedSubjectLoad), so this action — and this test — no longer cover
// parts/topics; it only asserts the subject-id lookup.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRtSubjectData } from '@/app/app/vfr-rt/actions/get-rt-subject'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
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

    // Canonical RT subject comes from migration 097 — read, don't seed.
    const { data: subject, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id')
      .eq('code', 'RT')
      .single()
    if (subjErr || !subject) throw new Error(`RT subject lookup: ${subjErr?.message ?? 'missing'}`)
    rtSubjectId = subject.id
  })

  afterAll(async () => {
    // Single org + its users — cleanupTestData handles FK-safe teardown. No
    // easa_* reference rows were seeded.
    await cleanupTestData({ admin, orgId, userIds: [studentId] })
  })

  it('returns the canonical RT subject id', async () => {
    await signInAs(email, password)

    const result = await getRtSubjectData()

    // The subject lookup is what the deleted_at bug broke — under the bug this call threw.
    expect(result.id).toBe(rtSubjectId)
  })
})
