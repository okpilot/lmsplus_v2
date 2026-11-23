/**
 * Red Team Spec: a sitting code whose entry, candidate or sitting was removed cannot be redeemed or listed
 * (Vector MR, #1777)
 *
 * Attack: an admin starts today's sitting and issues codes to three students, then removes one
 * student's entry (remove_exam_sitting_entries) and another's candidacy (remove_exam_sitting_candidates).
 * A fourth student holds a code of tomorrow's sitting, which the admin cancels (cancel_exam_sitting).
 * Each removed student redeems its known code through start_internal_exam_session and reads
 * list_my_active_internal_exam_codes.
 * Expected: `code_voided`; no session; the code stays unconsumed; the code is not listed.
 * CONTROL: before removal each code is listed with its sitting; the untouched student redeems its code.
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
type Code = { id: string; code: string }

const MO_PASSWORD = 'redteam-mo-student-2026!'
const EMAILS = {
  entry: 'redteam-mo-entry@lmsplus.local',
  cand: 'redteam-mo-cand@lmsplus.local',
  keep: 'redteam-mo-keep@lmsplus.local',
  cancel: 'redteam-mo-cancel@lmsplus.local',
} as const
type Who = keyof typeof EMAILS

async function enterAndIssue(
  adminClient: SupabaseClient,
  admin: Admin,
  sittingId: string,
  userIds: string[],
  subjectId: string,
): Promise<Map<string, Code & { entryId: string }>> {
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
  const out = new Map<string, Code & { entryId: string }>()
  for (const uid of userIds) {
    const { data: entry, error: eErr } = await admin
      .from('exam_sitting_entries')
      .select('id')
      .eq('sitting_id', sittingId)
      .eq('user_id', uid)
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
    out.set(uid, { id: code.id, code: code.code, entryId: entry.id })
  }
  return out
}

async function listedSitting(client: SupabaseClient, codeId: string): Promise<string | null> {
  const { data, error } = await client.rpc('list_my_active_internal_exam_codes')
  if (error) throw new Error(`list: ${error.message}`)
  const row = (data as { id: string; sitting_id: string | null }[]).find((r) => r.id === codeId)
  return row ? (row.sitting_id ?? 'legacy') : null
}

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('consumed_at, voided_at')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code read: ${error?.message}`)
  return data as { consumed_at: string | null; voided_at: string | null }
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

test.describe('Red Team: removed sitting code redeem (MR)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let adminId: string
  let subjectId: string
  const ids = {} as Record<Who, string>
  const clients = {} as Record<Who, SupabaseClient>
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    track.adminId = adminId
    for (const who of Object.keys(EMAILS) as Who[]) {
      ids[who] = await upsertUser(admin, EMAILS[who], MO_PASSWORD, a.orgId)
      clients[who] = await createAuthenticatedClient(EMAILS[who], MO_PASSWORD)
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
        .in('student_id', Object.values(ids))
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
    if (errors.length > 0) throw new Error(`MR afterEach: ${errors.join('; ')}`)
  })

  test('MR: removed-entry, removed-candidate and cancelled-sitting codes are voided and unlisted', async () => {
    const today = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(today)
    const st = await adminClient.rpc('start_exam_sitting', { p_sitting_id: today })
    expect(st.error).toBeNull()
    const todayCodes = await enterAndIssue(
      adminClient,
      admin,
      today,
      [ids.entry, ids.cand, ids.keep],
      subjectId,
    )
    const tomorrow = await createSittingRpc(
      adminClient,
      adminId,
      new Date(Date.now() + 24 * 3600 * 1000),
    )
    track.sittingIds.push(tomorrow)
    const tomorrowCodes = await enterAndIssue(adminClient, admin, tomorrow, [ids.cancel], subjectId)

    const codes = {
      entry: todayCodes.get(ids.entry),
      cand: todayCodes.get(ids.cand),
      keep: todayCodes.get(ids.keep),
      cancel: tomorrowCodes.get(ids.cancel),
    }
    for (const c of Object.values(codes)) if (c) codeIds.push(c.id)

    // CONTROL: every code is listed with its sitting before any removal.
    for (const [who, sid] of [
      ['entry', today],
      ['cand', today],
      ['keep', today],
      ['cancel', tomorrow],
    ] as const) {
      const c = codes[who]
      if (!c) throw new Error(`${who}: no code`)
      expect(await listedSitting(clients[who], c.id), `${who} listed before`).toBe(sid)
    }

    const re = await adminClient.rpc('remove_exam_sitting_entries', {
      p_sitting_id: today,
      p_entry_ids: [codes.entry?.entryId],
    })
    expect(re.error).toBeNull()
    expect(re.data?.[0]?.codes_voided).toBe(1)
    const rc = await adminClient.rpc('remove_exam_sitting_candidates', {
      p_sitting_id: today,
      p_user_ids: [ids.cand],
    })
    expect(rc.error).toBeNull()
    expect(rc.data?.[0]?.codes_voided).toBe(1)
    const cx = await adminClient.rpc('cancel_exam_sitting', { p_sitting_id: tomorrow })
    expect(cx.error).toBeNull()
    expect(cx.data?.[0]?.codes_voided).toBe(1)

    for (const who of ['entry', 'cand', 'cancel'] as const) {
      const c = codes[who]
      if (!c) throw new Error(`${who}: no code`)
      const { data, error } = await clients[who].rpc('start_internal_exam_session', {
        p_code: c.code,
      })
      expect(error?.message ?? `${who}: started ${JSON.stringify(data)}`, who).toMatch(
        /code_voided/,
      )
      const s = await codeState(admin, c.id)
      expect(s.consumed_at, who).toBeNull()
      expect(s.voided_at, who).not.toBeNull()
      expect(await liveExamSessions(admin, ids[who]), who).toBe(0)
      expect(await listedSitting(clients[who], c.id), `${who} listed after`).toBeNull()
    }

    // CONTROL: the untouched student in the same started sitting redeems its code.
    const keep = codes.keep
    if (!keep) throw new Error('keep: no code')
    const { data: ok, error: okErr } = await clients.keep.rpc('start_internal_exam_session', {
      p_code: keep.code,
    })
    expect(okErr).toBeNull()
    expect(typeof ok?.[0]?.session_id).toBe('string')
    expect((await codeState(admin, keep.id)).consumed_at).not.toBeNull()
  })
})
