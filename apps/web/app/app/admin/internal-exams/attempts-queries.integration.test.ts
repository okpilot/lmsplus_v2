// App-layer integration tier (#925) — Attempts tab search/group/sitting filters against real local Postgres (I-AQ).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
import { insertPassedSession } from '@/lib/integration-support/passed-session'
import { listInternalExamAttempts } from './attempts-queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-aq-admin-${suffix}@test.local`
const otherAdminEmail = `int-aq-oadmin-${suffix}@test.local`
const RANDOM_UUID = '99999999-9999-4999-8999-999999999999'

let orgId: string
let otherOrgId: string
let adminId: string
let instructorId: string
let otherAdminId: string
let refs: ReferenceIds
let sittingId: string
let otherOrgSittingId: string
let groupId: string
let otherOrgGroupId: string
let foreignStudentId: string
const userIds: string[] = []
const user: Record<string, string> = {}
const session: Record<string, string> = {}

async function mkStudent(
  tag: string,
  fullName: string,
  email = `int-aq-${tag}-${suffix}@test.local`,
  org = orgId,
) {
  const id = await createTestUser({ admin, orgId: org, email, password, role: 'student', fullName })
  userIds.push(id)
  user[tag] = id
  return id
}

async function mkSession(tag: string, org = orgId) {
  session[tag] = await insertPassedSession(admin, {
    orgId: org,
    userId: user[tag] as string,
    subjectId: refs.subjectId,
    score: 80,
    endedAt: new Date(Date.now() - 60_000),
  })
}

async function must<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
) {
  const r = await p
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}

async function mustRow<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const row = await must(p, what)
  if (row == null) throw new Error(`${what}: no row`)
  return row
}

async function sittingCodeFor(tag: string, sitting: string, org = orgId, issuer = adminId) {
  await must(
    admin
      .from('exam_sitting_candidates')
      .insert({ organization_id: org, sitting_id: sitting, user_id: user[tag] }),
    'candidate',
  )
  const entry = await mustRow(
    admin
      .from('exam_sitting_entries')
      .insert({
        organization_id: org,
        sitting_id: sitting,
        user_id: user[tag],
        subject_id: refs.subjectId,
      })
      .select('id')
      .single(),
    'entry',
  )
  await must(
    admin.from('internal_exam_codes').insert({
      code: `AQ${tag}${suffix}`.slice(0, 12).toUpperCase(),
      subject_id: refs.subjectId,
      student_id: user[tag],
      issued_by: issuer,
      organization_id: org,
      sitting_entry_id: entry.id,
      expires_at: new Date(Date.now() + 5 * 3_600_000).toISOString(),
      consumed_at: new Date().toISOString(),
      consumed_session_id: session[tag],
    }),
    'code',
  )
}

async function mkSittingIn(org: string, by: string) {
  const s = await mustRow(
    admin
      .from('exam_sittings')
      .insert({
        organization_id: org,
        mode: 'remote',
        invigilator_id: instructorId,
        created_by: by,
        scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
      .select('id')
      .single(),
    'sitting',
  )
  return s.id as string
}

async function mkGroup(org: string, name: string) {
  const g = await mustRow(
    admin.from('student_groups').insert({ organization_id: org, name }).select('id').single(),
    'group',
  )
  return g.id as string
}

async function addMember(group: string, tag: string, removed = false, org = orgId) {
  await must(
    admin.from('student_group_members').insert({
      organization_id: org,
      group_id: group,
      user_id: user[tag],
      ...(removed ? { deleted_at: new Date().toISOString() } : {}),
    }),
    'member',
  )
}

const ids = (r: { rows: { sessionId: string }[] }) => r.rows.map((x) => x.sessionId).sort()
const want = (...tags: string[]) => tags.map((t) => session[t] as string).sort()

describe('listInternalExamAttempts filters (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-aq ${suffix}`, slug: `int-aq-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-aq-b ${suffix}`,
      slug: `int-aq-b-${suffix}`,
    })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-aq-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    otherAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: otherAdminEmail,
      password,
      role: 'admin',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `AQ_${suffix}`,
      subjectName: `Attempts Subject ${suffix}`,
      topicCode: `AQ_${suffix}_T1`,
      topicName: `Attempts Topic ${suffix}`,
    })
    const cfg = await admin.from('exam_configs').insert(
      [orgId, otherOrgId].map((org) => ({
        organization_id: org,
        subject_id: refs.subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })),
    )
    if (cfg.error) throw new Error(`exam config: ${cfg.error.message}`)
    await mkStudent('sit', `Sitting Sam ${suffix}`)
    await mkStudent('legacy', `Legacy Lee ${suffix}`)
    await mkStudent('active', `Active Ann ${suffix}`)
    await mkStudent('deact', `Deact Dan ${suffix}`)
    await mkStudent('removed', `Removed Rae ${suffix}`)
    await mkStudent('pct', `Percent 50%_x ${suffix}`, `int-aq-pct-${suffix}@test.local`)
    await mkStudent('plain', `Percent 505x ${suffix}`, `int-aq-plain-${suffix}@test.local`)
    for (const t of ['sit', 'legacy', 'active', 'deact', 'removed', 'pct', 'plain'])
      await mkSession(t)

    sittingId = await mkSittingIn(orgId, adminId)
    otherOrgSittingId = await mkSittingIn(otherOrgId, otherAdminId)
    foreignStudentId = await mkStudent(
      'foreign',
      `Foreign Fay ${suffix}`,
      `int-aq-foreign-${suffix}@test.local`,
      otherOrgId,
    )
    userIds.splice(userIds.indexOf(foreignStudentId), 1)
    await mkSession('foreign', otherOrgId)
    await sittingCodeFor('sit', sittingId)
    await sittingCodeFor('active', sittingId)

    groupId = await mkGroup(orgId, `AQ group ${suffix}`)
    otherOrgGroupId = await mkGroup(otherOrgId, `AQ other ${suffix}`)
    await sittingCodeFor('foreign', otherOrgSittingId, otherOrgId, otherAdminId)
    await addMember(otherOrgGroupId, 'foreign', false, otherOrgId)
    await addMember(groupId, 'active')
    await addMember(groupId, 'deact')
    await addMember(groupId, 'removed', true)
    await must(
      admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', user.deact),
      'deactivate',
    )
    await signInAs(adminEmail, password)
  }, 180_000)

  afterAll(async () => {
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId, ...userIds] })
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherAdminId, foreignStudentId] })
      await cleanupReferenceData({ admin, refs: [refs] })
    } catch (e) {
      throw new Error(`afterAll: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, 120_000)

  it('sitting filter returns only attempts consumed under that sitting; totalCount equals rows', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ sittingId })
    expect(ids(r)).toEqual(want('sit', 'active'))
    expect(r.totalCount).toBe(r.rows.length)
    expect(ids(r)).not.toContain(session.legacy)
  })

  it('maps sittingId on a sitting attempt and null on a legacy attempt', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ studentId: user.sit as string })
    expect(r.rows[0]?.sittingId).toBe(sittingId)
    const l = await listInternalExamAttempts({ studentId: user.legacy as string })
    expect(l.rows[0]).toMatchObject({ sittingId: null, sittingAt: null })
  })

  it('sitting filter of another organization or a random id returns no rows', async () => {
    await signInAs(adminEmail, password)
    await signInAs(otherAdminEmail, password)
    const fr = await listInternalExamAttempts({ sittingId: otherOrgSittingId })
    expect(ids(fr)).toContain(session.foreign)
    expect(fr.totalCount).toBeGreaterThan(0)
    await signInAs(adminEmail, password)
    for (const s of [otherOrgSittingId, RANDOM_UUID]) {
      const r = await listInternalExamAttempts({ sittingId: s })
      expect(r.rows).toEqual([])
      expect(r.totalCount).toBe(0)
    }
    const all = await listInternalExamAttempts({})
    expect(ids(all)).not.toContain(session.foreign)
  })

  it('group filter includes active and deactivated members and excludes removed memberships', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ groupId })
    expect(ids(r)).toEqual(want('active', 'deact'))
    expect(r.totalCount).toBe(2)
  })

  it('group filter of another organization returns no rows', async () => {
    await signInAs(adminEmail, password)
    await signInAs(otherAdminEmail, password)
    const fr = await listInternalExamAttempts({ groupId: otherOrgGroupId })
    expect(ids(fr)).toContain(session.foreign)
    expect(fr.totalCount).toBeGreaterThan(0)
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ groupId: otherOrgGroupId })
    expect(r.rows).toEqual([])
    expect(r.totalCount).toBe(0)
    const all = await listInternalExamAttempts({})
    expect(ids(all)).not.toContain(session.foreign)
  })

  it('search matches % and _ literally on the name', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ search: '50%_x' })
    expect(ids(r)).toEqual(want('pct'))
  })

  it('search matches the email', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ search: `int-aq-legacy-${suffix}` })
    expect(ids(r)).toEqual(want('legacy'))
  })

  it('search with a comma and parenthesis is literal, not a filter syntax error', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ search: 'a,b)(' })
    expect(r.rows).toEqual([])
  })

  it('filters combine with AND', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ sittingId, groupId, search: 'Active Ann' })
    expect(ids(r)).toEqual(want('active'))
    const none = await listInternalExamAttempts({ sittingId, groupId, search: 'Sitting Sam' })
    expect(none.rows).toEqual([])
    expect(none.totalCount).toBe(0)
  })

  it('a past-end page with filters returns the last page and a count equal to the filtered rows', async () => {
    await signInAs(adminEmail, password)
    const r = await listInternalExamAttempts({ sittingId, page: 99 })
    expect(ids(r)).toEqual(want('sit', 'active'))
    expect(r.totalCount).toBe(2)
  })
})
