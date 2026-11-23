/**
 * Red Team Spec: a sitting entry with a consumed code is never removed (Vector MT, #1777)
 *
 * Attack: an admin starts today's sitting and issues one code per student. For each student the
 * student's start_internal_exam_session and the admin's remove_exam_sitting_entries for that
 * student's entry are fired concurrently.
 * Expected: every pair ends either with the entry removed and the code voided unconsumed, or with
 * the entry live and the code consumed (remove refused `entry_has_attempt`); never a soft-deleted
 * entry holding a consumed code.
 * CONTROL: sequential start then remove raises `entry_has_attempt`; sequential remove then start
 * voids the code (`code_voided`).
 *
 * Hermetic: throwaway students; sittings carry EXAM_SITTING_E2E_PREFIX; afterEach soft-deletes the
 * created sessions and codes, then cleanupSittingFixtures (per-step accumulator).
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
type Issued = { codeId: string; code: string; entryId: string }

const MT_PASSWORD = 'redteam-mt-student-2026!'
const RACE_N = 12
const RACE_EMAILS = Array.from({ length: RACE_N }, (_, i) => `redteam-mt-race${i}@lmsplus.local`)
const CTRL_EMAILS = ['redteam-mt-ctrl-start@lmsplus.local', 'redteam-mt-ctrl-remove@lmsplus.local']

async function enterAndIssue(
  adminClient: SupabaseClient,
  admin: Admin,
  sittingId: string,
  userIds: string[],
  subjectId: string,
): Promise<Map<string, Issued>> {
  const add = await adminClient.rpc('add_exam_sitting_candidates', {
    p_sitting_id: sittingId,
    p_user_ids: userIds,
  })
  if (add.error) throw new Error(`add candidates: ${add.error.message}`)
  const ent = await adminClient.rpc('add_exam_sitting_entries', {
    p_sitting_id: sittingId,
    p_user_ids: userIds,
    p_subject_ids: userIds.map(() => subjectId),
  })
  if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
  expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(userIds.length)
  const iss = await adminClient.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
  if (iss.error) throw new Error(`issue: ${iss.error.message}`)
  expect(iss.data?.[0]?.issued, JSON.stringify(iss.data)).toBe(userIds.length)
  const { data: entries, error: eErr } = await admin
    .from('exam_sitting_entries')
    .select('id, user_id')
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (eErr || !entries) throw new Error(`entries: ${eErr?.message}`)
  const out = new Map<string, Issued>()
  for (const e of entries as { id: string; user_id: string }[]) {
    const { data: code, error: cErr } = await admin
      .from('internal_exam_codes')
      .select('id, code')
      .eq('sitting_entry_id', e.id)
      .is('voided_at', null)
      .is('deleted_at', null)
      .single()
    if (cErr || !code) throw new Error(`code: ${cErr?.message}`)
    out.set(e.user_id, { codeId: code.id, code: code.code, entryId: e.id })
  }
  return out
}

async function pairState(admin: Admin, it: Issued) {
  const { data: e, error: eErr } = await admin
    .from('exam_sitting_entries')
    .select('deleted_at')
    .eq('id', it.entryId)
    .single()
  if (eErr || !e) throw new Error(`entry read: ${eErr?.message}`)
  const { data: c, error: cErr } = await admin
    .from('internal_exam_codes')
    .select('consumed_at, voided_at')
    .eq('id', it.codeId)
    .single()
  if (cErr || !c) throw new Error(`code read: ${cErr?.message}`)
  return {
    entryRemoved: e.deleted_at !== null,
    consumed: c.consumed_at !== null,
    voided: c.voided_at !== null,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test.describe('Red Team: sitting code redeem vs entry removal race (MT)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let adminId: string
  let subjectId: string
  const raceIds: string[] = []
  const raceClients = new Map<string, SupabaseClient>()
  const ctrlIds: string[] = []
  const ctrlClients = new Map<string, SupabaseClient>()
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    track.adminId = adminId
    for (const email of RACE_EMAILS) {
      const id = await upsertUser(admin, email, MT_PASSWORD, a.orgId)
      raceIds.push(id)
      raceClients.set(id, await createAuthenticatedClient(email, MT_PASSWORD))
    }
    for (const email of CTRL_EMAILS) {
      const id = await upsertUser(admin, email, MT_PASSWORD, a.orgId)
      ctrlIds.push(id)
      ctrlClients.set(id, await createAuthenticatedClient(email, MT_PASSWORD))
    }
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(a.orgId, subjectId, picked.topicId)
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: now })
        .in('student_id', [...raceIds, ...ctrlIds])
        .eq('mode', 'internal_exam')
        .is('deleted_at', null)
      if (error) throw new Error(`sessions: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (codeIds.length > 0) {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: now })
          .in('id', codeIds)
          .is('deleted_at', null)
        if (error) throw new Error(`codes: ${error.message}`)
      }
      codeIds.length = 0
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`MT afterEach: ${errors.join('; ')}`)
  })

  // .skip until remove_exam_sitting_entries locks the codes before its entry_has_attempt check (#1777).
  test.skip('MT: concurrent redeem and remove never leave a removed entry with a consumed code', async () => {
    const sitting = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(sitting)
    const st = await adminClient.rpc('start_exam_sitting', { p_sitting_id: sitting })
    expect(st.error).toBeNull()
    const issued = await enterAndIssue(
      adminClient,
      admin,
      sitting,
      [...raceIds, ...ctrlIds],
      subjectId,
    )
    for (const it of issued.values()) codeIds.push(it.codeId)
    const get = (uid: string): Issued => {
      const it = issued.get(uid)
      if (!it) throw new Error(`no code for ${uid}`)
      return it
    }
    const client = (m: Map<string, SupabaseClient>, uid: string): SupabaseClient => {
      const c = m.get(uid)
      if (!c) throw new Error(`no client for ${uid}`)
      return c
    }

    // CONTROL: start then remove -> entry_has_attempt.
    const [cs, cr] = ctrlIds as [string, string]
    const csIt = get(cs)
    const s1 = await client(ctrlClients, cs).rpc('start_internal_exam_session', {
      p_code: csIt.code,
    })
    expect(s1.error).toBeNull()
    const r1 = await adminClient.rpc('remove_exam_sitting_entries', {
      p_sitting_id: sitting,
      p_entry_ids: [csIt.entryId],
    })
    expect(r1.error?.message).toBe('entry_has_attempt')
    expect(await pairState(admin, csIt)).toEqual({
      entryRemoved: false,
      consumed: true,
      voided: false,
    })
    // CONTROL: remove then start -> code_voided.
    const crIt = get(cr)
    const r2 = await adminClient.rpc('remove_exam_sitting_entries', {
      p_sitting_id: sitting,
      p_entry_ids: [crIt.entryId],
    })
    expect(r2.error).toBeNull()
    const s2 = await client(ctrlClients, cr).rpc('start_internal_exam_session', {
      p_code: crIt.code,
    })
    expect(s2.error?.message).toBe('code_voided')
    expect(await pairState(admin, crIt)).toEqual({
      entryRemoved: true,
      consumed: false,
      voided: true,
    })

    // ATTACK: concurrent redeem and remove, staggered 0..RACE_N-1 ms.
    const outcomes: string[] = []
    for (const [i, uid] of raceIds.entries()) {
      const it = get(uid)
      const [start, remove] = await Promise.all([
        client(raceClients, uid).rpc('start_internal_exam_session', { p_code: it.code }),
        sleep(i).then(() =>
          adminClient.rpc('remove_exam_sitting_entries', {
            p_sitting_id: sitting,
            p_entry_ids: [it.entryId],
          }),
        ),
      ])
      const s = await pairState(admin, it)
      outcomes.push(
        `${i}: start=${start.error?.message ?? 'ok'} remove=${remove.error?.message ?? 'ok'} ${JSON.stringify(s)}`,
      )
    }
    const broken = outcomes.filter((o) => o.includes('"entryRemoved":true,"consumed":true'))
    expect(broken, outcomes.join('\n')).toEqual([])
  })
})
