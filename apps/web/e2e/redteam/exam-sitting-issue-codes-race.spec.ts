/**
 * Red Team Spec: issue_sitting_exam_codes parallel double-issue (Vector NV, #1777)
 *
 * Attack: the egmont admin fires PARALLEL issue_sitting_exam_codes calls on one sitting with
 * three issuable entries, racing the per-entry "already issued" plan check.
 * Expected: every entry holds exactly one live code and one `internal_exam.code_issued` audit row;
 * the calls' `issued` counts sum to 3.
 * CONTROL: once an entry's live code is expired (service role), the next call reissues it: the
 * old code is voided `reissued_after_expiry` and a second code row exists for that entry.
 *
 * Hermetic: throwaway students; sittings carry EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the
 * created codes, then cleanupSittingFixtures (per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ADMIN_EMAIL, ADMIN_PASSWORD, seedRedTeamAdmin } from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NA_STUDENTS = [1, 2, 3].map((n) => ({
  email: `redteam-na-student-${n}@lmsplus.local`,
  password: `redteam-na-student-${n}-2026!`,
}))
const PARALLEL = 4

type CodeRow = {
  id: string
  sitting_entry_id: string
  voided_at: string | null
  void_reason: string | null
}

async function entryCodes(admin: Admin, entryIds: string[]): Promise<CodeRow[]> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, sitting_entry_id, voided_at, void_reason')
    .in('sitting_entry_id', entryIds)
    .is('deleted_at', null)
  if (error || !data) throw new Error(`codes: ${error?.message}`)
  return data as CodeRow[]
}

async function issuedAudits(admin: Admin, codeIds: string[]): Promise<number> {
  const { data, error } = await admin
    .from('audit_events')
    .select('id')
    .eq('event_type', 'internal_exam.code_issued')
    .in('resource_id', codeIds)
  if (error || !data) throw new Error(`audit: ${error?.message}`)
  return data.length
}

test.describe('Red Team: issue_sitting_exam_codes parallel race (NV)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let sittingId: string
  let entryIds: string[] = []
  const studentIds: string[] = []
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    for (const s of NA_STUDENTS) {
      studentIds.push(await upsertUser(admin, s.email, s.password, a.orgId))
    }
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(sittingId)
    const add = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: studentIds,
    })
    if (add.error) throw new Error(`add candidates: ${add.error.message}`)
    const ent = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: studentIds,
      p_subject_ids: studentIds.map(() => picked.subjectId),
    })
    if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(NA_STUDENTS.length)
    const { data: entries, error: eErr } = await admin
      .from('exam_sitting_entries')
      .select('id')
      .eq('sitting_id', sittingId)
      .is('deleted_at', null)
    if (eErr || entries?.length !== NA_STUDENTS.length)
      throw new Error(`entries: ${eErr?.message ?? entries?.length}`)
    entryIds = entries.map((e) => e.id as string)
    expect(await entryCodes(admin, entryIds)).toHaveLength(0)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      if (entryIds.length > 0) {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('sitting_entry_id', entryIds)
          .is('deleted_at', null)
        if (error) throw new Error(`codes: ${error.message}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NV afterAll: ${errors.join('; ')}`)
  })

  test('NV: parallel issue calls leave one live code and one issued audit per entry', async () => {
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        egmontAdmin.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId }),
      ),
    )
    let issued = 0
    for (const r of results) {
      expect(r.error, JSON.stringify(r.error)).toBeNull()
      const row = r.data?.[0]
      expect(row, JSON.stringify(r.data)).toBeDefined()
      expect(typeof row?.issued).toBe('number')
      issued += row?.issued as number
    }
    expect(issued).toBe(NA_STUDENTS.length)

    const codes = await entryCodes(admin, entryIds)
    expect(codes).toHaveLength(NA_STUDENTS.length)
    for (const id of entryIds) {
      expect(codes.filter((c) => c.sitting_entry_id === id && c.voided_at === null)).toHaveLength(1)
    }
    expect(
      await issuedAudits(
        admin,
        codes.map((c) => c.id),
      ),
    ).toBe(NA_STUDENTS.length)

    // CONTROL: with the live code expired, the next call DOES insert a second code for the entry.
    const target = codes[0] as CodeRow
    const { data: exp, error: expErr } = await admin
      .from('internal_exam_codes')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', target.id)
      .select('id')
    if (expErr || exp?.length !== 1) throw new Error(`expire: ${expErr?.message ?? exp?.length}`)
    const re = await egmontAdmin.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    expect(re.error).toBeNull()
    expect(re.data?.[0]?.reissued_after_expiry).toBe(1)
    expect(re.data?.[0]?.issued).toBe(1)
    const after = (await entryCodes(admin, entryIds)).filter(
      (c) => c.sitting_entry_id === target.sitting_entry_id,
    )
    expect(after).toHaveLength(2)
    expect(after.find((c) => c.id === target.id)?.void_reason).toBe('reissued_after_expiry')
    expect(after.filter((c) => c.voided_at === null)).toHaveLength(1)
  })
})
