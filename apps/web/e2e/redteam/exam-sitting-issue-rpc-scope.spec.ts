/**
 * Red Team Spec: entry, code-issue and roster RPC scope (Vector MN, #1777)
 *
 * Attack: a cross-org admin, a student, an instructor and a soft-deleted admin with a live JWT call
 * add_exam_sitting_entries, issue_sitting_exam_codes, get_exam_sitting_issue_preview,
 * get_exam_sitting_subject_eligibility, list_exam_sitting_roster and
 * list_exam_sitting_removed_entries against an egmont sitting holding one entry with a live code.
 * Expected: cross-org `sitting_not_found`, the others `not_admin`; no plaintext code returned;
 * the entry count and the live code are unchanged.
 * CONTROL: the egmont admin's roster returns the plaintext code; a second entry added by the egmont
 * admin is issued a code.
 *
 * Hermetic: throwaway student and soft-deleted admin; sittings carry EXAM_SITTING_E2E_PREFIX;
 * afterAll soft-deletes the created codes, then cleanupSittingFixtures (per-step accumulator).
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
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>
type Call = { fn: string; args: Record<string, unknown> }

const MN_STUDENT_EMAIL = 'redteam-mn-student@lmsplus.local'
const MN_STUDENT2_EMAIL = 'redteam-mn-student2@lmsplus.local'
const MN_STUDENT_PASSWORD = 'redteam-mn-student-2026!'
const MN_SOFTDEL_EMAIL = 'redteam-mn-softdel-admin@lmsplus.local'
const MN_SOFTDEL_PASSWORD = 'redteam-mn-softdel-admin-2026!'

function calls(sittingId: string, userId: string, subjectId: string, entryId: string): Call[] {
  const s = { p_sitting_id: sittingId }
  return [
    {
      fn: 'add_exam_sitting_entries',
      args: { ...s, p_user_ids: [userId], p_subject_ids: [subjectId] },
    },
    { fn: 'issue_sitting_exam_codes', args: { ...s, p_entry_ids: [entryId] } },
    { fn: 'get_exam_sitting_issue_preview', args: s },
    { fn: 'get_exam_sitting_subject_eligibility', args: s },
    { fn: 'list_exam_sitting_roster', args: s },
    { fn: 'list_exam_sitting_removed_entries', args: s },
  ]
}

async function liveState(admin: Admin, sittingId: string) {
  const { data: entries, error } = await admin
    .from('exam_sitting_entries')
    .select('id')
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (error || !entries) throw new Error(`entries: ${error?.message}`)
  const ids = entries.map((e) => e.id as string)
  const { data: codes, error: cErr } = await admin
    .from('internal_exam_codes')
    .select('id, code')
    .in('sitting_entry_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])
    .is('voided_at', null)
    .is('deleted_at', null)
    .order('id')
  if (cErr || !codes) throw new Error(`codes: ${cErr?.message}`)
  return { entries: ids.sort(), codes }
}

test.describe('Red Team: sitting entry/issue/roster RPC scope (MN)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let callers: [string, SupabaseClient, RegExp][]
  let adminId: string
  let orgId: string
  let studentId: string
  let student2Id: string
  let subjectId: string
  let sittingId: string
  let entryId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const ins = await seedRedTeamInstructor()
    const cross = await seedCrossOrgAdmin()
    adminId = a.adminUserId
    orgId = a.orgId
    track.adminId = adminId
    studentId = await upsertUser(admin, MN_STUDENT_EMAIL, MN_STUDENT_PASSWORD, orgId)
    student2Id = await upsertUser(admin, MN_STUDENT2_EMAIL, MN_STUDENT_PASSWORD, orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(orgId, subjectId, picked.topicId)

    const softId = await upsertUser(admin, MN_SOFTDEL_EMAIL, MN_SOFTDEL_PASSWORD, orgId, 'admin')
    const { error: liveErr } = await admin
      .from('users')
      .update({ deleted_at: null })
      .eq('id', softId)
    if (liveErr) throw new Error(`softdel revive: ${liveErr.message}`)
    const softDel = await createAuthenticatedClient(MN_SOFTDEL_EMAIL, MN_SOFTDEL_PASSWORD)
    const { data: del, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softId)
      .select('id')
    if (delErr || !del?.length) throw new Error(`softdel: ${delErr?.message ?? '0 rows'}`)

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    callers = [
      [
        'cross-org admin',
        await createAuthenticatedClient(cross.email, cross.password),
        /sitting_not_found/,
      ],
      ['student', await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD), /not_admin/],
      ['instructor', await createAuthenticatedClient(ins.email, ins.password), /not_admin/],
      ['soft-deleted admin', softDel, /not_admin/],
    ]

    sittingId = await createSittingRpc(egmontAdmin, adminId)
    track.sittingIds.push(sittingId)
    const add = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId, student2Id],
    })
    if (add.error) throw new Error(`add candidates: ${add.error.message}`)
    const ent = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
      p_subject_ids: [subjectId],
    })
    if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(1)
    const iss = await egmontAdmin.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    if (iss.error) throw new Error(`issue: ${iss.error.message}`)
    expect(iss.data?.[0]?.issued).toBe(1)
    const st = await liveState(admin, sittingId)
    expect(st.entries).toHaveLength(1)
    entryId = st.entries[0] as string
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .in('student_id', [studentId, student2Id])
        .not('sitting_entry_id', 'is', null)
        .is('deleted_at', null)
      if (error) throw new Error(`codes: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`MN afterAll: ${errors.join('; ')}`)
  })

  test('MN: non-egmont-admin callers are refused and get no plaintext code', async () => {
    const before = await liveState(admin, sittingId)
    expect(before.entries).toEqual([entryId])
    expect(before.codes).toHaveLength(1)
    const plaintext = before.codes[0]?.code as string
    expect(plaintext).toMatch(/^[A-Z2-9]{8}$/)

    const list = calls(sittingId, student2Id, subjectId, entryId)
    expect(list).toHaveLength(6)
    for (const [who, client, token] of callers) {
      for (const c of list) {
        const { data, error } = await client.rpc(c.fn, c.args)
        expect(error?.message ?? `${who} ${c.fn}: no error`, `${who} ${c.fn}`).toMatch(token)
        expect(JSON.stringify(data ?? null)).not.toContain(plaintext)
      }
    }
    expect(await liveState(admin, sittingId)).toEqual(before)

    // CONTROL: the egmont admin reads the plaintext code and can add + issue a second entry.
    const { data: roster, error: rErr } = await egmontAdmin.rpc('list_exam_sitting_roster', {
      p_sitting_id: sittingId,
    })
    expect(rErr).toBeNull()
    expect(JSON.stringify(roster)).toContain(plaintext)
    const ent = await egmontAdmin.rpc('add_exam_sitting_entries', list[0]?.args)
    expect(ent.error).toBeNull()
    expect(ent.data?.[0]?.added).toBe(1)
    const iss = await egmontAdmin.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    expect(iss.error).toBeNull()
    expect(iss.data?.[0]).toMatchObject({ issued: 1, skipped_already_issued: 1 })
    const after = await liveState(admin, sittingId)
    expect(after.entries).toHaveLength(2)
    expect(after.codes).toHaveLength(2)
  })
})
