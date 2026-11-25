// App-layer integration tier (#925) — checkSittingCode against real local Postgres.
//
// The guard's whole decision rests on one claim a mocked client cannot test: a null
// `quiz_sessions!consumed_session_id(ended_at)` embed means the session row is HIDDEN from this
// admin by RLS (`instructors_read_sessions` filters `deleted_at IS NULL`), not that there is none.
// If the FK hint were wrong or the policy let soft-deleted rows through, the mocked unit tests
// would stay green while the guard voided — or refused — the wrong codes.
import { createServerSupabaseClient } from '@repo/db/server'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  type ReferenceIds,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { checkSittingCode } from './sitting-code-guard'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let adminId: string
let studentId: string
let student2Id: string
let refs: ReferenceIds
let sittingId: string
let entryId: string
let entry2Id: string
let liveCodeId: string
let hiddenCodeId: string
let legacyCodeId: string
let deletedCodeId: string

const adminEmail = `int-scg-admin-${suffix}@test.local`
const studentEmail = `int-scg-stu-${suffix}@test.local`
const student2Email = `int-scg-stu2-${suffix}@test.local`
const password = 'test-pass-123'
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const REASON = 'admin typed reason'

async function insertSession(deletedAt: string | null, student: string): Promise<string> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: student,
      mode: 'internal_exam',
      ended_at: null,
      deleted_at: deletedAt,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertSession: ${error.message}`)
  return data.id as string
}

async function insertCode(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert({
      subject_id: refs.subjectId,
      student_id: studentId,
      issued_by: adminId,
      expires_at: FUTURE,
      organization_id: orgId,
      ...fields,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertCode: ${error.message}`)
  return data.id as string
}

let seeded: Promise<void> | null = null

describe('checkSittingCode (app-layer integration)', () => {
  // `signInAs` cannot run in `beforeAll`: the harness resets the cookie jar per test. The seed is
  // memoised as a PROMISE so a rejection re-throws for every test rather than leaving ids unset.
  beforeEach(async () => {
    seeded ??= seed()
    await seeded
  })

  async function seed(): Promise<void> {
    orgId = await createTestOrg({ admin, name: `int-scg ${suffix}`, slug: `scg-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })
    student2Id = await createTestUser({
      admin,
      orgId,
      email: student2Email,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SCG_${suffix}`,
      subjectName: `Sitting Code Guard Subject ${suffix}`,
      topicCode: `SCG_${suffix}_T1`,
      topicName: `Sitting Code Guard Topic ${suffix}`,
    })

    const sitting = await admin
      .from('exam_sittings')
      .insert({
        organization_id: orgId,
        scheduled_at: new Date().toISOString(),
        mode: 'remote',
        invigilator_id: adminId,
        created_by: adminId,
        started_at: new Date().toISOString(),
        started_by: adminId,
      })
      .select('id')
      .single()
    if (sitting.error) throw new Error(`seed sitting: ${sitting.error.message}`)
    sittingId = sitting.data.id as string

    const candidate = await admin.from('exam_sitting_candidates').insert([
      { organization_id: orgId, sitting_id: sittingId, user_id: studentId },
      { organization_id: orgId, sitting_id: sittingId, user_id: student2Id },
    ])
    if (candidate.error) throw new Error(`seed candidate: ${candidate.error.message}`)

    // Two entries, not one: `uq_internal_exam_codes_live_entry` permits a single live code per
    // entry, so the live-session code and the hidden-session code cannot share one.
    const entries = await admin
      .from('exam_sitting_entries')
      .insert([
        {
          organization_id: orgId,
          sitting_id: sittingId,
          user_id: studentId,
          subject_id: refs.subjectId,
        },
        {
          organization_id: orgId,
          sitting_id: sittingId,
          user_id: student2Id,
          subject_id: refs.subjectId,
        },
      ])
      .select('id, user_id')
    if (entries.error) throw new Error(`seed entries: ${entries.error.message}`)
    const findEntry = (user: string): string => {
      const row = entries.data.find((e) => e.user_id === user)
      if (!row) throw new Error(`seed entries: no row for ${user}`)
      return row.id as string
    }
    entryId = findEntry(studentId)
    entry2Id = findEntry(student2Id)

    const liveSession = await insertSession(null, studentId)
    const hiddenSession = await insertSession(new Date().toISOString(), student2Id)

    liveCodeId = await insertCode({
      code: `SCG-${suffix}-LIVE`,
      sitting_entry_id: entryId,
      consumed_at: new Date().toISOString(),
      consumed_session_id: liveSession,
    })
    hiddenCodeId = await insertCode({
      code: `SCG-${suffix}-HIDDEN`,
      student_id: student2Id,
      sitting_entry_id: entry2Id,
      consumed_at: new Date().toISOString(),
      consumed_session_id: hiddenSession,
    })
    legacyCodeId = await insertCode({ code: `SCG-${suffix}-LEGACY` })
    deletedCodeId = await insertCode({
      code: `SCG-${suffix}-DELETED`,
      sitting_entry_id: entryId,
      deleted_at: new Date().toISOString(),
    })
  }

  afterAll(async () => {
    const errors: string[] = []
    const step = async (what: string, run: () => Promise<void>) => {
      try {
        await run()
      } catch (e) {
        errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // internal_exam_codes FK-references quiz_sessions and users, and exam_sitting_entries
    // references the sitting, so this order is the FK order, not a preference.
    await step('delete codes', async () => {
      const { error } = await admin
        .from('internal_exam_codes')
        .delete()
        .eq('organization_id', orgId)
      if (error) throw new Error(error.message)
    })
    await step('delete entries', async () => {
      const { error } = await admin
        .from('exam_sitting_entries')
        .delete()
        .eq('sitting_id', sittingId)
      if (error) throw new Error(error.message)
    })
    await step('delete candidates', async () => {
      const { error } = await admin
        .from('exam_sitting_candidates')
        .delete()
        .eq('sitting_id', sittingId)
      if (error) throw new Error(error.message)
    })
    await step('delete sitting', async () => {
      const { error } = await admin.from('exam_sittings').delete().eq('id', sittingId)
      if (error) throw new Error(error.message)
    })
    if (errors.length === 0) {
      await step('cleanupTestData', () =>
        cleanupTestData({ admin, orgId, userIds: [adminId, studentId, student2Id] }),
      )
    }
    if (errors.length === 0) {
      await step('cleanupReferenceData', () => cleanupReferenceData({ admin, refs: [refs] }))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('allows a running sitting attempt, whose session RLS does show the admin', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    expect(await checkSittingCode(supabase, liveCodeId, REASON)).toEqual({ ok: true })
  })

  it('refuses the same shape once the session is soft-deleted and so hidden by RLS', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    // The CONTROL above proves the embed resolves at all, so this refusal comes from the policy
    // hiding the row, not from a broken FK hint that would null every embed.
    expect(await checkSittingCode(supabase, hiddenCodeId, REASON)).toEqual({
      ok: false,
      error: 'This attempt is no longer live — there is nothing to void',
    })
  })

  it('refuses a system void reason on a sitting code', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    expect(await checkSittingCode(supabase, liveCodeId, 'sitting_closed')).toEqual({
      ok: false,
      error: 'That reason is reserved for the system — type a different one',
    })
  })

  it('leaves a legacy code alone on a free-text reason', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    expect(await checkSittingCode(supabase, legacyCodeId, REASON)).toEqual({ ok: true })
  })

  it('refuses a system void reason on a legacy code too', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    expect(await checkSittingCode(supabase, legacyCodeId, 'sitting_closed')).toEqual({
      ok: false,
      error: 'That reason is reserved for the system — type a different one',
    })
  })

  it('treats a soft-deleted code as nonexistent, the way the RPC does', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    expect(await checkSittingCode(supabase, deletedCodeId, REASON)).toEqual({
      ok: false,
      error: 'Code not found',
    })
  })

  it('fails closed on a code id that does not exist', async () => {
    await signInAs(adminEmail, password)
    const supabase = await createServerSupabaseClient()

    expect(
      await checkSittingCode(supabase, '00000000-0000-0000-0000-000000000000', REASON),
    ).toEqual({ ok: false, error: 'Code not found' })
  })
})
