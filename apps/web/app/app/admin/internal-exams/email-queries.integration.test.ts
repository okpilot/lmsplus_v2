// App-layer integration tier (#925) — getSittingCodesForEmail against real local Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedReferenceData,
} from '@/lib/integration-support/harness'
import { getSittingCodesForEmail } from './email-queries'

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const HOUR = 3_600_000

let orgId: string
let otherOrgId: string
let adminId: string
let otherAdminId: string
let instructorId: string
let refs: ReferenceIds
let sittingId: string
let goneUserId: string
const userIds: string[] = []
const codeByLabel: Record<string, string> = {}

async function student(label: string): Promise<string> {
  const id = await createTestUser({
    admin,
    orgId,
    email: `int-sce-${label}-${suffix}@test.local`,
    password,
    role: 'student',
    fullName: `Sce ${label} ${suffix}`,
  })
  userIds.push(id)
  const { error } = await admin
    .from('exam_sitting_candidates')
    .insert({ organization_id: orgId, sitting_id: sittingId, user_id: id })
  if (error) throw new Error(`candidate ${label}: ${error.message}`)
  return id
}

async function entryWithCode(
  label: string,
  userId: string,
  code: Record<string, unknown> = {},
  entry: Record<string, unknown> = {},
) {
  const ent = await admin
    .from('exam_sitting_entries')
    .insert({
      organization_id: orgId,
      sitting_id: sittingId,
      user_id: userId,
      subject_id: refs.subjectId,
      ...entry,
    })
    .select('id')
    .single()
  if (ent.error) throw new Error(`entry ${label}: ${ent.error.message}`)
  const c = await admin
    .from('internal_exam_codes')
    .insert({
      code: `SC${label}${suffix}`.slice(0, 12).toUpperCase(),
      subject_id: refs.subjectId,
      student_id: userId,
      issued_by: adminId,
      organization_id: orgId,
      sitting_entry_id: ent.data.id,
      expires_at: new Date(Date.now() + 5 * HOUR).toISOString(),
      ...code,
    })
    .select('id')
    .single()
  if (c.error) throw new Error(`code ${label}: ${c.error.message}`)
  codeByLabel[label] = c.data.id
}

describe('getSittingCodesForEmail (app-layer integration)', () => {
  beforeAll(async () => {
    mockRequireAdmin.mockResolvedValue({ supabase: admin, organizationId: '', userId: '' })
    orgId = await createTestOrg({ admin, name: `int-sce ${suffix}`, slug: `int-sce-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-sce-b ${suffix}`,
      slug: `int-sce-b-${suffix}`,
    })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `int-sce-admin-${suffix}@test.local`,
      password,
      role: 'admin',
    })
    otherAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `int-sce-other-${suffix}@test.local`,
      password,
      role: 'admin',
    })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-sce-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SCE_${suffix}`,
      subjectName: `Email Subject ${suffix}`,
      topicCode: `SCE_${suffix}_T1`,
      topicName: `Email Topic ${suffix}`,
    })
    const s = await admin
      .from('exam_sittings')
      .insert({
        organization_id: orgId,
        mode: 'in_person',
        invigilator_id: instructorId,
        created_by: adminId,
        scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (s.error) throw new Error(`sitting: ${s.error.message}`)
    sittingId = s.data.id

    await entryWithCode('A', await student('a'))
    await entryWithCode('EMAILED', await student('emailed'), {
      emailed_at: new Date().toISOString(),
    })
    await entryWithCode('VOIDED', await student('voided'), {
      voided_at: new Date().toISOString(),
      voided_by: adminId,
    })
    await entryWithCode('EXPIRED', await student('expired'), {
      expires_at: new Date(Date.now() - HOUR).toISOString(),
    })
    await entryWithCode(
      'REMOVED',
      await student('removed'),
      {},
      {
        deleted_at: new Date().toISOString(),
        deleted_by: adminId,
      },
    )
    const consumedStudent = await student('consumed')
    const sess = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: consumedStudent,
        mode: 'internal_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [], pass_mark: 75 },
        total_questions: 1,
        time_limit_seconds: 600,
      })
      .select('id')
      .single()
    if (sess.error) throw new Error(`session: ${sess.error.message}`)
    await entryWithCode('CONSUMED', consumedStudent, {
      consumed_at: new Date().toISOString(),
      consumed_session_id: sess.data.id,
    })
    goneUserId = await student('gone')
    await entryWithCode('GONE', goneUserId)
    const c = await getAuthenticatedClient({
      email: `int-sce-admin-${suffix}@test.local`,
      password,
    })
    const rm = await c.rpc('remove_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [goneUserId],
    })
    if (rm.error) throw new Error(`remove candidate: ${rm.error.message}`)
    await entryWithCode('DEL', await student('del'), {
      deleted_at: new Date().toISOString(),
    })
    const dead = await student('dead')
    await entryWithCode('DEAD', dead)
    const { error: deadErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', dead)
    if (deadErr) throw new Error(`deactivate: ${deadErr.message}`)
  }, 120_000)

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId, ...userIds] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherAdminId] })
    } catch (e) {
      errors.push(`cleanupTestData other: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  }, 120_000)

  it('returns only the unused, unemailed code of an active candidate with its email payload', async () => {
    const r = await getSittingCodesForEmail(orgId, sittingId)
    expect(r.rows.map((x) => x.codeId)).toEqual([codeByLabel.A])
    expect(r.rows.map((x) => x.codeId)).not.toContain(codeByLabel.DEL)
    expect(r.rows.map((x) => x.codeId)).not.toContain(codeByLabel.CONSUMED)
    expect(r.rows[0]).toMatchObject({
      studentName: `Sce a ${suffix}`,
      email: `int-sce-a-${suffix}@test.local`,
      subjectName: `Email Subject ${suffix}`,
      mode: 'in_person',
    })
    expect(typeof r.rows[0]?.code).toBe('string')
    expect(typeof r.rows[0]?.scheduledAt).toBe('string')
  })

  it('counts a deactivated student as skipped, not as a row', async () => {
    const r = await getSittingCodesForEmail(orgId, sittingId)
    expect(r.rows.map((x) => x.codeId)).not.toContain(codeByLabel.DEAD)
    expect(r.skipped).toBe(1)
  })

  it('reads the sitting status with the rows', async () => {
    const r = await getSittingCodesForEmail(orgId, sittingId)
    expect(r.sitting).toMatchObject({ status: 'scheduled' })
  })

  it('returns 0 rows for a sitting id of another organization', async () => {
    const own = await getSittingCodesForEmail(orgId, sittingId)
    expect(own.rows.length).toBeGreaterThan(0)
    const r = await getSittingCodesForEmail(otherOrgId, sittingId)
    expect(r.rows).toEqual([])
    expect(r.skipped).toBe(0)
    expect(r.sitting).toBeNull()
  })

  it('excludes the code of a candidate removed through remove_exam_sitting_candidates', async () => {
    const r = await getSittingCodesForEmail(orgId, sittingId)
    const ids = r.rows.map((x) => x.codeId)
    expect(ids[0]).toBe(codeByLabel.A)
    expect(ids).not.toContain(codeByLabel.GONE)
  })

  it('excludes a code once its emailed_at is set', async () => {
    await entryWithCode('STM', await student('stm'))
    const before = await getSittingCodesForEmail(orgId, sittingId)
    expect(before.rows.map((x) => x.codeId)).toContain(codeByLabel.STM)
    const { error } = await admin
      .from('internal_exam_codes')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', codeByLabel.STM)
    if (error) throw new Error(`stamp: ${error.message}`)
    const r = await getSittingCodesForEmail(orgId, sittingId)
    expect(r.rows.map((x) => x.codeId)).not.toContain(codeByLabel.STM)
    expect(r.rows.map((x) => x.codeId)).toContain(codeByLabel.A)
  })
})
