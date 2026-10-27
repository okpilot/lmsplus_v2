import { describe, expect, it } from 'vitest'
import { fixtureSuffix } from './fixture-suffix'
import { getAdminClient } from './setup'

/** Courses model PR1: migration backfill + subject→course assignment. */
describe('courses migration: backfill and subject assignment', () => {
  const admin = getAdminClient()

  async function courseIds(): Promise<Record<string, string>> {
    const { data, error } = await admin.from('courses').select('id, code')
    expect(error).toBeNull()
    return Object.fromEntries((data ?? []).map((c) => [c.code as string, c.id as string]))
  }

  it('seeds PPL_A, VFR_RT and ATPL_A courses', async () => {
    const ids = await courseIds()
    expect(Object.keys(ids).sort()).toEqual(expect.arrayContaining(['ATPL_A', 'PPL_A', 'VFR_RT']))
  })

  // A fresh `db reset` (CI) has no student before the migration: the backfill tests skip there.
  it('AC1: every pre-existing student has an active PPL_A and VFR_RT enrolment; no admin/instructor has any', async ({
    skip,
  }) => {
    const ids = await courseIds()
    const { data: ppl } = await admin
      .from('courses')
      .select('created_at')
      .eq('code', 'PPL_A')
      .single()
    expect(ppl?.created_at).toBeTruthy()

    const { data: students, error: sErr } = await admin
      .from('users')
      .select('id')
      .eq('role', 'student')
      .lt('created_at', ppl?.created_at as string)
    expect(sErr).toBeNull()
    if (!students?.length) skip('no student existed before the migration')

    // Backfill rows share the migration transaction's now(); later edits do not change them.
    const { data: enrolments, error: eErr } = await admin
      .from('course_enrolments')
      .select('user_id, course_id, organization_id')
      .eq('enrolled_at', ppl?.created_at as string)
    expect(eErr).toBeNull()

    for (const s of students ?? []) {
      const mine = (enrolments ?? []).filter((e) => e.user_id === s.id)
      expect(mine.map((e) => e.course_id).sort()).toEqual([ids.PPL_A, ids.VFR_RT].sort())
    }

    const { data: staff } = await admin.from('users').select('id').neq('role', 'student')
    const staffIds = new Set((staff ?? []).map((u) => u.id as string))
    expect((enrolments ?? []).filter((e) => staffIds.has(e.user_id as string))).toEqual([])
  })

  it('AC1: backfilled enrolment carries the student organization and NULL enrolled_by', async ({
    skip,
  }) => {
    const { data: ppl } = await admin
      .from('courses')
      .select('created_at')
      .eq('code', 'PPL_A')
      .single()
    // Backfill rows share the migration transaction's now().
    const { data: rows, error } = await admin
      .from('course_enrolments')
      .select('user_id, organization_id, enrolled_by')
      .eq('enrolled_at', ppl?.created_at as string)
      .limit(50)
    expect(error).toBeNull()
    if (!rows?.length) skip('no backfill rows')
    for (const r of rows ?? []) {
      expect(r.enrolled_by).toBeNull()
      const { data: u } = await admin
        .from('users')
        .select('organization_id')
        .eq('id', r.user_id as string)
        .single()
      expect(u?.organization_id).toBe(r.organization_id)
    }
  })

  it('AC2: RT subject belongs to VFR_RT, 100 to ATPL_A and every other subject to PPL_A', async () => {
    const ids = await courseIds()
    const { data, error } = await admin.from('easa_subjects').select('code, course_id')
    expect(error).toBeNull()
    expect((data ?? []).map((s) => s.code)).toContain('100')
    const expected = (code: string) =>
      code === 'RT' ? ids.VFR_RT : code === '100' ? ids.ATPL_A : ids.PPL_A
    for (const s of data ?? []) {
      expect(s.course_id).toBe(expected(s.code as string))
    }
  })

  it('AC2: a subject inserted without course_id defaults to PPL_A', async () => {
    const ids = await courseIds()
    const code = `ZZ${fixtureSuffix()
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()}`
    const { data, error } = await admin
      .from('easa_subjects')
      .insert({ code, name: 'Default course probe', short: 'ZZ', sort_order: 999 })
      .select('id, course_id')
      .single()
    expect(error).toBeNull()
    expect(data?.course_id).toBe(ids.PPL_A)
    const { error: cleanupError } = await admin
      .from('easa_subjects')
      .delete()
      .eq('id', data?.id as string)
    expect(cleanupError).toBeNull()
  })
})
