// App-layer integration tier (#925) — softDeleteQuestion against real Postgres.
//
// This tier exists because #815 shipped broken and stayed broken: the co-located
// unit test mocks the Supabase client, so it asserted the intended chain while
// the real statement was rejected by RLS on every call in production. Only a
// test that issues the actual UPDATE can catch that class of bug, so the first
// case below is a direct regression test for #815.
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
import { softDeleteQuestion } from './soft-delete-question'

const admin = getAdminClient()
const suffix = Date.now()
const password = 'test-pass-123'

let refs: ReferenceIds | undefined
let orgAId: string
let orgBId: string
let adminAId: string
let adminBId: string
/** Deleted by its own org's admin — the #815 regression case. */
let questionA1: string
/** Target of the cross-org attempt; must survive untouched. */
let questionA2: string

const adminAEmail = `int-sdq-admin-a-${suffix}@test.local`
const adminBEmail = `int-sdq-admin-b-${suffix}@test.local`

async function readQuestion(id: string) {
  // Service-role read: the row is invisible to any RLS client once soft-deleted
  // (that invisibility is the whole reason the action bypasses RLS), so state
  // assertions have to come from the admin client.
  const { data, error } = await admin
    .from('questions')
    .select('id, deleted_at, deleted_by')
    .eq('id', id)
    .single<{ id: string; deleted_at: string | null; deleted_by: string | null }>()
  if (error) throw new Error(`readQuestion(${id}): ${error.message}`)
  return data
}

describe('softDeleteQuestion (app-layer integration)', () => {
  beforeAll(async () => {
    // Suffixed code, never a real EASA code: seedReferenceData upserts with
    // `onConflict: 'code'` and writes `short: subjectCode`, so reusing '050'
    // would rewrite the seeded Meteorology row's `short` from 'MET' on any DB
    // that already holds the seed.
    refs = await seedReferenceData({
      admin,
      subjectCode: `SDQ${suffix}`,
      subjectName: `soft-delete-question subject ${suffix}`,
      topicCode: `SDQT${suffix}`,
      topicName: `soft-delete-question ${suffix}`,
    })
    const ref = refs

    orgAId = await createTestOrg({ admin, name: `sdq A ${suffix}`, slug: `sdq-a-${suffix}` })
    orgBId = await createTestOrg({ admin, name: `sdq B ${suffix}`, slug: `sdq-b-${suffix}` })

    adminAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: adminAEmail,
      password,
      role: 'admin',
    })
    adminBId = await createTestUser({
      admin,
      orgId: orgBId,
      email: adminBEmail,
      password,
      role: 'admin',
    })

    const seeded = await seedQuestions({
      admin,
      orgId: orgAId,
      createdBy: adminAId,
      subjectId: ref.subjectId,
      topicId: ref.topicId,
      subtopicId: ref.subtopicId,
      count: 2,
    })
    // Guard the indexes rather than casting blind (code-style.md §5 — the
    // cast-guard rule is not relaxed in test files): if seedQuestions ever
    // returns fewer ids, fail here instead of surfacing an opaque PostgREST
    // error from readQuestion(undefined) several assertions later.
    const [first, second] = seeded.questionIds
    if (!first || !second) {
      throw new Error(`seedQuestions: expected 2 ids, got ${seeded.questionIds.length}`)
    }
    questionA1 = first
    questionA2 = second
  })

  afterAll(async () => {
    const errors: string[] = []

    // Both orgs are independent teardowns — isolate each so a failure in the
    // first cannot leak the second's rows (code-style.md §7).
    try {
      await cleanupTestData({ admin, orgId: orgAId, userIds: [adminAId] })
    } catch (e) {
      errors.push(`cleanupTestData(A): ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId: orgBId, userIds: [adminBId] })
    } catch (e) {
      errors.push(`cleanupTestData(B): ${e instanceof Error ? e.message : String(e)}`)
    }

    // Reference rows are global (not org-scoped), so cleanupTestData never
    // removes them — without this the topic/subject accumulate one row per run.
    //
    // `errors.length === 0` alone is NOT a sufficient gate: cleanupTestData is
    // best-effort (deleteOrLog logs per-table failures rather than throwing —
    // packages/db/src/__integration__/cleanup.ts), so a failed `questions`
    // delete leaves `errors` empty. Since questions.subject_id REFERENCES
    // easa_subjects(id) with no ON DELETE, deleting the subject while a
    // question survives raises 23503 and masks the original failure. So verify
    // the children are actually gone before touching the parent.
    if (errors.length === 0) {
      const { data: survivors, error: survivorErr } = await admin
        .from('questions')
        .select('id')
        .in('organization_id', [orgAId, orgBId])
      if (survivorErr) {
        errors.push(`questions survivor check: ${survivorErr.message}`)
      } else if ((survivors?.length ?? 0) > 0) {
        errors.push(
          `cleanupTestData left ${survivors?.length} question(s) behind — skipping cleanupReferenceData to avoid a 23503 that would mask this`,
        )
      } else {
        try {
          await cleanupReferenceData({ admin, refs: [refs] })
        } catch (e) {
          errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('marks the question deleted and records who deleted it', async () => {
    // Regression guard for #815: before the service-role fix this call returned
    // "Failed to delete question" and the row was never touched.
    const before = await readQuestion(questionA1)
    expect(before.deleted_at).toBeNull()

    await signInAs(adminAEmail, password)
    const result = await softDeleteQuestion({ id: questionA1 })

    expect(result.success).toBe(true)

    const after = await readQuestion(questionA1)
    expect(after.deleted_at).not.toBeNull()
    expect(after.deleted_by).toBe(adminAId)
  })

  it('leaves the question untouched when an admin from another organisation tries to delete it', async () => {
    // Non-vacuous: assert the row exists and is live BEFORE the blocked call, so
    // "still not deleted" afterwards proves rejection rather than an empty table
    // (code-style.md §7 — negative assertions must be reachable).
    const before = await readQuestion(questionA2)
    expect(before.deleted_at).toBeNull()

    await signInAs(adminBEmail, password)
    const result = await softDeleteQuestion({ id: questionA2 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected cross-org delete to fail')
    expect(result.error).toBe('Question not found or not accessible')

    const after = await readQuestion(questionA2)
    expect(after.deleted_at).toBeNull()
    expect(after.deleted_by).toBeNull()
  })

  it('keeps the original deleter when the same question is deleted twice', async () => {
    // questionA1 was deleted by admin A in the first test; a second attempt must
    // not re-stamp deleted_at/deleted_by and overwrite that record.
    //
    // The dependency on the first test is DELIBERATE — re-deleting a row this
    // suite actually deleted is the scenario under test. Vitest runs a file's
    // tests in declaration order, and the `not.toBeNull()` precondition below
    // makes a reordering fail loudly instead of passing vacuously. Do not
    // "fix" this by seeding an independently pre-deleted row.
    const before = await readQuestion(questionA1)
    expect(before.deleted_at).not.toBeNull()

    await signInAs(adminAEmail, password)
    const result = await softDeleteQuestion({ id: questionA1 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected re-delete to fail')
    // Pin the message so a zero-row match stays distinguishable from an
    // unexpected DB error path reaching the same `success: false`.
    expect(result.error).toBe('Question not found or not accessible')

    const after = await readQuestion(questionA1)
    expect(after.deleted_at).toBe(before.deleted_at)
    expect(after.deleted_by).toBe(adminAId)
  })
})
