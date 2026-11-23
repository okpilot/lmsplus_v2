/**
 * Red Team Spec: a sitting code is never redeemed after Close (Vector MU, #1777)
 *
 * Attack: per race pair, an admin starts a one-student sitting and issues the code; the student's
 * start_internal_exam_session and the admin's close_exam_sitting are fired concurrently.
 * Expected: each pair ends either with the code consumed, not voided, and close counting one running
 * attempt; or with the code voided unconsumed, no session, and the redeem refused `code_voided` or
 * `sitting_not_open`. Never a code both consumed and voided; never a session started on a refused code.
 * CONTROL: sequential close then redeem raises `code_voided`; sequential redeem then close reports
 * attempts_running 1 with the code consumed.
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
type Issued = { sittingId: string; codeId: string; code: string }

const MU_PASSWORD = 'redteam-mu-student-2026!'
const RACE_N = 8
const RACE_EMAILS = Array.from({ length: RACE_N }, (_, i) => `redteam-mu-race${i}@lmsplus.local`)
const CTRL_EMAILS = ['redteam-mu-ctrl-close@lmsplus.local', 'redteam-mu-ctrl-start@lmsplus.local']

async function startedSittingCode(
  adminClient: SupabaseClient,
  admin: Admin,
  adminId: string,
  track: SittingTrack,
  userId: string,
  subjectId: string,
): Promise<Issued> {
  const sittingId = await createSittingRpc(adminClient, adminId)
  track.sittingIds.push(sittingId)
  const add = await adminClient.rpc('add_exam_sitting_candidates', {
    p_sitting_id: sittingId,
    p_user_ids: [userId],
  })
  if (add.error) throw new Error(`add candidates: ${add.error.message}`)
  const ent = await adminClient.rpc('add_exam_sitting_entries', {
    p_sitting_id: sittingId,
    p_user_ids: [userId],
    p_subject_ids: [subjectId],
  })
  if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
  expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(1)
  const st = await adminClient.rpc('start_exam_sitting', { p_sitting_id: sittingId })
  if (st.error) throw new Error(`start: ${st.error.message}`)
  const iss = await adminClient.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
  if (iss.error) throw new Error(`issue: ${iss.error.message}`)
  expect(iss.data?.[0]?.issued, JSON.stringify(iss.data)).toBe(1)
  const { data: entry, error: eErr } = await admin
    .from('exam_sitting_entries')
    .select('id')
    .eq('sitting_id', sittingId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()
  if (eErr || !entry) throw new Error(`entry: ${eErr?.message}`)
  const { data: code, error: cErr } = await admin
    .from('internal_exam_codes')
    .select('id, code')
    .eq('sitting_entry_id', entry.id)
    .is('voided_at', null)
    .is('deleted_at', null)
    .single()
  if (cErr || !code) throw new Error(`code: ${cErr?.message}`)
  return { sittingId, codeId: code.id, code: code.code }
}

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('consumed_at, voided_at, consumed_session_id')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code read: ${error?.message}`)
  return {
    consumed: data.consumed_at !== null,
    voided: data.voided_at !== null,
    session: data.consumed_session_id as string | null,
  }
}

async function liveExamSessions(admin: Admin, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('quiz_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('mode', 'internal_exam')
    .is('deleted_at', null)
  if (error) throw new Error(`sessions: ${error.message}`)
  return count ?? 0
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test.describe('Red Team: sitting code redeem vs Close race (MU)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let adminId: string
  let subjectId: string
  const raceIds: string[] = []
  const ctrlIds: string[] = []
  const clients = new Map<string, SupabaseClient>()
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    track.adminId = adminId
    for (const [list, emails] of [
      [raceIds, RACE_EMAILS],
      [ctrlIds, CTRL_EMAILS],
    ] as const) {
      for (const email of emails) {
        const id = await upsertUser(admin, email, MU_PASSWORD, a.orgId)
        list.push(id)
        clients.set(id, await createAuthenticatedClient(email, MU_PASSWORD))
      }
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
    if (errors.length > 0) throw new Error(`MU afterEach: ${errors.join('; ')}`)
  })

  test('MU: concurrent redeem and Close never consume a voided code', async () => {
    const client = (uid: string): SupabaseClient => {
      const c = clients.get(uid)
      if (!c) throw new Error(`no client for ${uid}`)
      return c
    }
    const issue = async (uid: string): Promise<Issued> => {
      const it = await startedSittingCode(adminClient, admin, adminId, track, uid, subjectId)
      codeIds.push(it.codeId)
      return it
    }

    // CONTROL: close then redeem -> code_voided.
    const [cc, cs] = ctrlIds as [string, string]
    const c1 = await issue(cc)
    const close1 = await adminClient.rpc('close_exam_sitting', { p_sitting_id: c1.sittingId })
    expect(close1.error).toBeNull()
    expect(close1.data?.[0]?.codes_voided).toBe(1)
    const s1 = await client(cc).rpc('start_internal_exam_session', { p_code: c1.code })
    expect(s1.error?.message).toBe('code_voided')
    expect(await codeState(admin, c1.codeId)).toEqual({
      consumed: false,
      voided: true,
      session: null,
    })
    expect(await liveExamSessions(admin, cc)).toBe(0)

    // CONTROL: redeem then close -> attempt counted running, code consumed.
    const c2 = await issue(cs)
    const s2 = await client(cs).rpc('start_internal_exam_session', { p_code: c2.code })
    expect(s2.error).toBeNull()
    const close2 = await adminClient.rpc('close_exam_sitting', { p_sitting_id: c2.sittingId })
    expect(close2.error).toBeNull()
    expect(close2.data?.[0]).toMatchObject({ codes_voided: 0, attempts_running: 1 })
    const st2 = await codeState(admin, c2.codeId)
    expect(st2).toMatchObject({ consumed: true, voided: false })
    expect(st2.session).toBe(s2.data?.[0]?.session_id)

    // ATTACK: concurrent redeem and close, staggered 0..RACE_N-1 ms.
    const issued = new Map<string, Issued>()
    for (const uid of raceIds) issued.set(uid, await issue(uid))
    const outcomes: string[] = []
    const broken: string[] = []
    for (const [i, uid] of raceIds.entries()) {
      const it = issued.get(uid)
      if (!it) throw new Error(`no code for ${uid}`)
      const [start, close] = await Promise.all([
        client(uid).rpc('start_internal_exam_session', { p_code: it.code }),
        sleep(i).then(() => adminClient.rpc('close_exam_sitting', { p_sitting_id: it.sittingId })),
      ])
      const s = await codeState(admin, it.codeId)
      const sessions = await liveExamSessions(admin, uid)
      const line = `${i}: start=${start.error?.message ?? 'ok'} close=${close.error?.message ?? JSON.stringify(close.data?.[0])} ${JSON.stringify(s)} sessions=${sessions}`
      outcomes.push(line)
      const redeemed =
        start.error === null &&
        s.consumed &&
        !s.voided &&
        s.session === start.data?.[0]?.session_id &&
        sessions === 1 &&
        close.error === null &&
        close.data?.[0]?.attempts_running === 1 &&
        close.data?.[0]?.codes_voided === 0
      const refused =
        /^(code_voided|sitting_not_open)$/.test(start.error?.message ?? '') &&
        !s.consumed &&
        s.voided &&
        sessions === 0 &&
        close.error === null &&
        close.data?.[0]?.codes_voided === 1
      if (!redeemed && !refused) broken.push(line)
    }
    expect(broken, outcomes.join('\n')).toEqual([])
  })
})
