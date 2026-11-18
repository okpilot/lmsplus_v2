// App-layer integration tier (#925) — remove actions against real local Postgres.
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
import { issuePopupBanner, tooManyPairsText } from '../_utils/popup-copy'
import { getIssuePreview } from '../people-queries'
import { addCandidates } from './add-candidates'
import { addSittingExams } from './add-exams'
import { issueSittingCodes } from './issue-sitting-codes'
import { removeCandidates } from './remove-candidates'
import { removeSittingEntries } from './remove-entries'
import { voidSittingCode } from './void-sitting-code'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-pact-admin-${suffix}@test.local`

let orgId: string
let adminId: string
let instructorId: string
let s1: string
let s2: string
let refs: ReferenceIds
let sittingId: string
let entryId: string

describe('sitting people Server Actions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-pact ${suffix}`, slug: `int-pact-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-pact-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    s1 = await createTestUser({
      admin,
      orgId,
      email: `int-pact-s1-${suffix}@test.local`,
      password,
      role: 'student',
    })
    s2 = await createTestUser({
      admin,
      orgId,
      email: `int-pact-s2-${suffix}@test.local`,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `PACT_${suffix}`,
      subjectName: `People Action ${suffix}`,
      topicCode: `PACT_${suffix}_T1`,
      topicName: `People Topic ${suffix}`,
    })
    const { data, error } = await admin
      .from('exam_sittings')
      .insert({
        organization_id: orgId,
        mode: 'remote',
        invigilator_id: instructorId,
        created_by: adminId,
        scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`sitting: ${error.message}`)
    sittingId = data.id
    await admin
      .from('exam_sitting_candidates')
      .insert([s1, s2].map((u) => ({ organization_id: orgId, sitting_id: sittingId, user_id: u })))
    const ent = await admin
      .from('exam_sitting_entries')
      .insert({
        organization_id: orgId,
        sitting_id: sittingId,
        user_id: s1,
        subject_id: refs.subjectId,
      })
      .select('id')
      .single()
    if (ent.error) throw new Error(`entry: ${ent.error.message}`)
    entryId = ent.data.id
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId, s1, s2] })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('removeSittingEntries soft-deletes the entry', async () => {
    await signInAs(adminEmail, password)
    const r = await removeSittingEntries({ sittingId, entryIds: [entryId] })
    expect(r).toMatchObject({ success: true, removed: 1 })
    const { data } = await admin
      .from('exam_sitting_entries')
      .select('deleted_at')
      .eq('id', entryId)
      .single()
    expect(data?.deleted_at).not.toBeNull()
  })

  it('removeSittingEntries reports entry_not_found copy for an unknown entry', async () => {
    await signInAs(adminEmail, password)
    expect(await removeSittingEntries({ sittingId, entryIds: [crypto.randomUUID()] })).toEqual({
      success: false,
      error: 'This exam is no longer in the sitting. Reload the page.',
    })
  })

  it('removeCandidates soft-deletes the candidate', async () => {
    await signInAs(adminEmail, password)
    const r = await removeCandidates({ sittingId, userIds: [s2] })
    expect(r).toMatchObject({ success: true, removed: 1 })
    const { data } = await admin
      .from('exam_sitting_candidates')
      .select('deleted_at')
      .eq('sitting_id', sittingId)
      .eq('user_id', s2)
      .single()
    expect(data?.deleted_at).not.toBeNull()
  })

  it('removeCandidates reports candidate_not_found copy for a person not in the sitting', async () => {
    await signInAs(adminEmail, password)
    expect(await removeCandidates({ sittingId, userIds: [s2] })).toEqual({
      success: false,
      error: 'Someone you selected is no longer in this sitting. Reload the page.',
    })
  })

  it('voidSittingCode voids an unused code and reports code_voided copy on a repeat', async () => {
    const ent = await admin
      .from('exam_sitting_entries')
      .insert({
        organization_id: orgId,
        sitting_id: sittingId,
        user_id: s1,
        subject_id: refs.subjectId,
      })
      .select('id')
      .single()
    if (ent.error) throw new Error(`entry: ${ent.error.message}`)
    const c = await admin
      .from('internal_exam_codes')
      .insert({
        code: `VP${suffix}`,
        subject_id: refs.subjectId,
        student_id: s1,
        issued_by: adminId,
        organization_id: orgId,
        sitting_entry_id: ent.data.id,
        expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .select('id')
      .single()
    if (c.error) throw new Error(`code: ${c.error.message}`)
    await signInAs(adminEmail, password)
    expect(await voidSittingCode({ sittingId, codeId: c.data.id, reason: 'Wrong person' })).toEqual(
      {
        success: true,
        codeId: c.data.id,
      },
    )
    const { data } = await admin
      .from('internal_exam_codes')
      .select('voided_at')
      .eq('id', c.data.id)
      .single()
    expect(data?.voided_at).not.toBeNull()
    expect(await voidSittingCode({ sittingId, codeId: c.data.id, reason: 'again' })).toEqual({
      success: false,
      error: 'Code is already voided.',
    })
  })
})

describe('sitting Add people / Add exams / Issue codes actions (app-layer integration)', () => {
  const sfx = fixtureSuffix()
  const email = (t: string) => `int-padd-${t}-${sfx}@test.local`
  const FULL = 500
  let org: string
  let otherOrg: string
  let a: string
  let ins: string
  let foreign: string
  let r: ReferenceIds
  let rOff: ReferenceIds
  let sit: string
  let fullSit: string
  let u: Record<string, string>
  const all: string[] = []
  const fullIds: string[] = []
  let group: string

  const mkUser = async (o: string, tag: string, name: string, courses?: string[]) => {
    const id = await createTestUser({
      admin,
      orgId: o,
      email: email(tag),
      password,
      role: 'student',
      fullName: name,
      ...(courses ? { courses } : {}),
    })
    all.push(id)
    return id
  }
  const sittingRow = async (day: number) => {
    const d = new Date()
    d.setUTCHours(9, 0, 0, 0)
    const { data, error } = await admin
      .from('exam_sittings')
      .insert({
        organization_id: org,
        mode: 'remote',
        invigilator_id: a,
        created_by: a,
        scheduled_at: new Date(d.getTime() + day * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`sitting: ${error.message}`)
    return data.id as string
  }
  const count = async (table: string, sitting: string) => {
    const { count: n, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('sitting_id', sitting)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
    return n ?? 0
  }

  beforeAll(async () => {
    org = await createTestOrg({ admin, name: `int-padd ${sfx}`, slug: `int-padd-${sfx}` })
    otherOrg = await createTestOrg({ admin, name: `int-padd-b ${sfx}`, slug: `int-padd-b-${sfx}` })
    a = await createTestUser({ admin, orgId: org, email: email('admin'), password, role: 'admin' })
    ins = await createTestUser({
      admin,
      orgId: org,
      email: email('ins'),
      password,
      role: 'instructor',
    })
    r = await seedReferenceData({
      admin,
      subjectCode: `PADD_${sfx}`,
      subjectName: `Padd ${sfx}`,
      topicCode: `PADD_${sfx}_T1`,
      topicName: `Padd Topic ${sfx}`,
    })
    rOff = await seedReferenceData({
      admin,
      subjectCode: `PADDO_${sfx}`,
      subjectName: `Padd Off ${sfx}`,
      topicCode: `PADDO_${sfx}_T1`,
      topicName: `Padd Off Topic ${sfx}`,
    })
    const cfg = await admin.from('exam_configs').insert({
      organization_id: org,
      subject_id: r.subjectId,
      enabled: true,
      total_questions: 10,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (cfg.error) throw new Error(`config: ${cfg.error.message}`)
    u = {
      one: await mkUser(org, 'one', 'Padd One'),
      two: await mkUser(org, 'two', 'Padd Two'),
      three: await mkUser(org, 'three', 'Padd Three'),
      dead: await mkUser(org, 'dead', 'Padd Dead'),
      g1: await mkUser(org, 'g1', 'Padd Group One'),
      g2: await mkUser(org, 'g2', 'Padd Group Two'),
    }
    foreign = await createTestUser({
      admin,
      orgId: otherOrg,
      email: email('foreign'),
      password,
      role: 'student',
      fullName: 'Padd Foreign',
    })
    await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', u.dead)
    sit = await sittingRow(4)
    fullSit = await sittingRow(5)
    const g = await admin
      .from('student_groups')
      .insert({ organization_id: org, name: `Padd Group ${sfx}`, created_by: a })
      .select('id')
      .single()
    if (g.error) throw new Error(`group: ${g.error.message}`)
    group = g.data.id
    const gm = await admin
      .from('student_group_members')
      .insert(
        [u.g1, u.g2, u.dead].map((user_id) => ({ organization_id: org, group_id: group, user_id })),
      )
    if (gm.error) throw new Error(`members: ${gm.error.message}`)
    for (let start = 0; start < FULL; start += 50) {
      const batch = await Promise.all(
        Array.from({ length: 50 }, (_, k) =>
          mkUser(org, `f${start + k}`, `Padd Full ${String(start + k).padStart(3, '0')}`),
        ),
      )
      fullIds.push(...batch)
    }
    const fc = await admin
      .from('exam_sitting_candidates')
      .insert(fullIds.map((user_id) => ({ organization_id: org, sitting_id: fullSit, user_id })))
    if (fc.error) throw new Error(`full candidates: ${fc.error.message}`)
  }, 240_000)

  afterAll(async () => {
    await admin.from('student_group_members').delete().eq('organization_id', org)
    await admin.from('student_groups').delete().eq('organization_id', org)
    // chunked: one `.in()` over 500+ ids exceeds the request URI limit; the last chunk removes the organization
    const ids = [a, ins, ...all.filter((x) => x !== foreign)]
    for (let i = 0; i < ids.length; i += 150) {
      await cleanupTestData({ admin, orgId: org, userIds: ids.slice(i, i + 150) })
    }
    await cleanupTestData({ admin, orgId: otherOrg, userIds: [foreign] })
    await cleanupReferenceData({ admin, refs: [r, rOff] })
  }, 240_000)

  describe('addCandidates', () => {
    it('adds the given people, then reports them as already in the sitting', async () => {
      await signInAs(email('admin'), password)
      expect(await addCandidates({ sittingId: sit, userIds: [u.one, u.two] })).toEqual({
        success: true,
        added: 2,
        skippedExisting: 0,
        skippedDeactivated: 0,
      })
      expect(await count('exam_sitting_candidates', sit)).toBe(2)
      expect(await addCandidates({ sittingId: sit, userIds: [u.one, u.three] })).toMatchObject({
        success: true,
        added: 1,
        skippedExisting: 1,
      })
    })

    it('snapshots the members of a group and skips the deactivated member', async () => {
      await signInAs(email('admin'), password)
      const before = await count('exam_sitting_candidates', sit)
      expect(await addCandidates({ sittingId: sit, groupIds: [group] })).toMatchObject({
        success: true,
        added: 2,
        skippedDeactivated: 1,
      })
      expect(await count('exam_sitting_candidates', sit)).toBe(before + 2)
    })

    it('reports a deactivated person picked by id as no longer existing and adds nothing', async () => {
      await signInAs(email('admin'), password)
      const before = await count('exam_sitting_candidates', sit)
      expect(await addCandidates({ sittingId: sit, userIds: [u.dead] })).toEqual({
        success: false,
        error: 'A person you selected no longer exists. Reload and try again.',
      })
      expect(await count('exam_sitting_candidates', sit)).toBe(before)
    })

    it('refuses the 501st person with the too-many copy and writes nothing', async () => {
      await signInAs(email('admin'), password)
      const extra = await mkUser(org, 'extra', 'Padd Extra')
      expect(await addCandidates({ sittingId: fullSit, userIds: [extra] })).toEqual({
        success: false,
        error: 'A sitting can hold at most 500 people.',
      })
      expect(await count('exam_sitting_candidates', fullSit)).toBe(FULL)
    })

    it('answers Invalid input without writing, and refuses an instructor', async () => {
      await signInAs(email('admin'), password)
      expect(await addCandidates({ sittingId: sit, userIds: ['nope'] })).toEqual({
        success: false,
        error: 'Invalid input',
      })
      await signInAs(email('ins'), password)
      await expect(addCandidates({ sittingId: sit, userIds: [u.two] })).rejects.toThrow(
        /NEXT_REDIRECT/,
      )
    })
  })

  describe('addSittingExams', () => {
    let sx: string

    beforeAll(async () => {
      sx = await sittingRow(6)
      for (const k of ['one', 'two', 'three']) {
        const { error } = await admin
          .from('exam_sitting_candidates')
          .insert({ organization_id: org, sitting_id: sx, user_id: u[k] })
        if (error) throw new Error(error.message)
      }
      const { error } = await admin.from('quiz_sessions').insert({
        organization_id: org,
        student_id: u.two,
        mode: 'internal_exam',
        subject_id: r.subjectId,
        config: { pass_mark: 75, question_ids: [] },
        total_questions: 0,
        started_at: new Date(Date.now() - 3_600_000).toISOString(),
        ended_at: new Date(Date.now() - 1_800_000).toISOString(),
        passed: true,
        score_percentage: 90,
      })
      if (error) throw new Error(error.message)
    })

    it('adds the given people and reports a blocked pair with the person name and reason', async () => {
      await signInAs(email('admin'), password)
      const res = await addSittingExams({
        sittingId: sx,
        subjectIds: [r.subjectId],
        userIds: [u.one, u.two],
      })
      expect(res).toMatchObject({ success: true, added: 1, skippedTotal: 1 })
      if (!res.success) return
      expect(res.skipped).toEqual([
        expect.objectContaining({ person: 'Padd Two', subjectId: r.subjectId, reason: 'passed' }),
      ])
      expect(res.skipped[0]?.detailAt).toBeTruthy()
      expect(await count('exam_sitting_entries', sx)).toBe(1)
    })

    it('all-mode builds every candidate x exam pair server-side', async () => {
      await signInAs(email('admin'), password)
      const res = await addSittingExams({ sittingId: sx, subjectIds: [r.subjectId], all: true })
      expect(res).toMatchObject({ success: true, added: 1, skippedTotal: 2 })
      if (!res.success) return
      expect(res.skipped.map((x) => x.reason).sort()).toEqual(['existing', 'passed'])
      expect(await count('exam_sitting_entries', sx)).toBe(2)
    })

    it('never adds a person who is not a candidate and shows an Unknown name for a foreign id', async () => {
      await signInAs(email('admin'), password)
      const res = await addSittingExams({
        sittingId: sx,
        subjectIds: [r.subjectId],
        userIds: [foreign],
      })
      expect(res).toMatchObject({ success: true, added: 0, skippedTotal: 1 })
      if (!res.success) return
      expect(res.skipped[0]).toMatchObject({ person: 'Unknown', reason: 'not_candidate' })
      expect(await count('exam_sitting_entries', sx)).toBe(2)
    })

    it('refuses an exam without an internal exam setup with its own copy', async () => {
      await signInAs(email('admin'), password)
      expect(
        await addSittingExams({ sittingId: sx, subjectIds: [rOff.subjectId], userIds: [u.one] }),
      ).toEqual({ success: false, error: 'An exam you picked is not set up as an internal exam.' })
    })

    it('refuses all-mode over the pair limit before any write', async () => {
      await signInAs(email('admin'), password)
      const subjects = [r.subjectId, crypto.randomUUID(), crypto.randomUUID()]
      expect(
        await addSittingExams({ sittingId: fullSit, subjectIds: subjects, all: true }),
      ).toEqual({
        success: false,
        error: tooManyPairsText(FULL, 3),
      })
      expect(await count('exam_sitting_entries', fullSit)).toBe(0)
    })

    it('answers Invalid input for both userIds and all, and refuses an instructor', async () => {
      await signInAs(email('admin'), password)
      expect(
        await addSittingExams({
          sittingId: sx,
          subjectIds: [r.subjectId],
          userIds: [u.one],
          all: true,
        }),
      ).toEqual({ success: false, error: 'Invalid input' })
      await signInAs(email('ins'), password)
      await expect(
        addSittingExams({ sittingId: sx, subjectIds: [r.subjectId], all: true }),
      ).rejects.toThrow(/NEXT_REDIRECT/)
    })
  })

  describe('closed sitting (AC 60)', () => {
    it('maps a closed sitting to the closed copy for both write actions', async () => {
      const closed = await sittingRow(0)
      const stamp = new Date(Date.now() - 1000).toISOString()
      await admin
        .from('exam_sittings')
        .update({ started_at: stamp, started_by: a, closed_at: stamp, closed_by: a })
        .eq('id', closed)
      await signInAs(email('admin'), password)
      const closedCopy = 'This sitting is closed and cannot be changed.'
      expect(await addCandidates({ sittingId: closed, userIds: [u.one] })).toEqual({
        success: false,
        error: closedCopy,
      })
      expect(
        await addSittingExams({ sittingId: closed, subjectIds: [r.subjectId], userIds: [u.one] }),
      ).toEqual({
        success: false,
        error: closedCopy,
      })
    })
  })

  describe('issueSittingCodes with userIds', () => {
    let si: string
    let noCode: string
    let expired: string
    let untouched: string
    let issuedResult: Awaited<ReturnType<typeof issueSittingCodes>> | undefined

    beforeAll(async () => {
      si = await sittingRow(7)
      noCode = await mkUser(org, 'ic1', 'Padd Issue One')
      expired = await mkUser(org, 'ic2', 'Padd Issue Two')
      untouched = await mkUser(org, 'ic3', 'Padd Issue Three')
      const entries: Record<string, string> = {}
      for (const [k, id] of Object.entries({ noCode, expired, untouched })) {
        await admin
          .from('exam_sitting_candidates')
          .insert({ organization_id: org, sitting_id: si, user_id: id })
        const e = await admin
          .from('exam_sitting_entries')
          .insert({ organization_id: org, sitting_id: si, user_id: id, subject_id: r.subjectId })
          .select('id')
          .single()
        if (e.error) throw new Error(e.error.message)
        entries[k] = e.data.id
      }
      const c = await admin.from('internal_exam_codes').insert({
        code: `PA${sfx}`,
        subject_id: r.subjectId,
        student_id: expired,
        issued_by: a,
        organization_id: org,
        sitting_entry_id: entries.expired,
        expires_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      if (c.error) throw new Error(c.error.message)
    })

    it('issues only the given people, with the same counts the preview showed', async () => {
      await signInAs(email('admin'), password)
      const preview = await getIssuePreview(si, [noCode, expired])
      if (!preview || 'ended' in preview) throw new Error('expected a preview')
      expect(preview.counts).toEqual({ issue: 1, reissue_after_expiry: 1 })
      expect(preview.studentsToIssue).toBe(2)
      const res = await issueSittingCodes({ sittingId: si, userIds: [noCode, expired] })
      // `issued` counts new and re-issued codes together
      expect(res).toMatchObject({ success: true, issued: 2, reissuedAfterExpiry: 1 })
      issuedResult = res
      const whole = await getIssuePreview(si)
      if (!whole || 'ended' in whole) throw new Error('expected a preview')
      expect(whole.counts).toMatchObject({ issue: 1, already_issued: 2 })
      const { count: codes } = await admin
        .from('internal_exam_codes')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', untouched)
      expect(codes).toBe(0)
    })

    // KNOWN PRODUCTION BUG (reported, keep red): `issued` already includes the re-issued code, so
    // `issuePopupBanner` (issued + reissuedAfterExpiry) calls a matching preview "changed".
    it('does not claim the counts changed when issued matches the preview', () => {
      if (!issuedResult?.success) throw new Error('issue result missing')
      const { success: _ok, ...counts } = issuedResult
      expect(issuePopupBanner(counts, 2).detail ?? '').not.toContain(
        'Counts changed since the preview.',
      )
    })
  })
})
