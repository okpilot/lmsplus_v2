/**
 * Red Team Spec: a sitting code cannot be redeemed before the sitting is started (Vector MM, #1777)
 *
 * Attack: an admin issues sitting codes for a scheduled (not started) sitting today and one tomorrow.
 * The student redeems each code through start_internal_exam_session before any Start.
 * Expected: `sitting_not_open`; no quiz_session; the code stays unconsumed.
 * CONTROL: after start_exam_sitting on today's sitting, the same code starts a session.
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

const TODAY_EMAIL = 'redteam-mm-today@lmsplus.local'
const TOMORROW_EMAIL = 'redteam-mm-tomorrow@lmsplus.local'
const MM_PASSWORD = 'redteam-mm-student-2026!'

async function issueOneCode(
  adminClient: SupabaseClient,
  admin: Admin,
  sittingId: string,
  userId: string,
  subjectId: string,
): Promise<{ id: string; code: string }> {
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
  const iss = await adminClient.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
  if (iss.error) throw new Error(`issue: ${iss.error.message}`)
  expect(iss.data?.[0]?.issued).toBe(1)
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
  return code
}

async function codeConsumed(admin: Admin, codeId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('consumed_at')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code read: ${error?.message}`)
  return data.consumed_at as string | null
}

test.describe('Red Team: sitting code redeemed before Start (MM)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let todayStudent: SupabaseClient
  let tomorrowStudent: SupabaseClient
  let adminId: string
  let todayId: string
  let tomorrowId: string
  let subjectId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    track.adminId = adminId
    todayId = await upsertUser(admin, TODAY_EMAIL, MM_PASSWORD, a.orgId)
    tomorrowId = await upsertUser(admin, TOMORROW_EMAIL, MM_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(a.orgId, subjectId, picked.topicId)
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    todayStudent = await createAuthenticatedClient(TODAY_EMAIL, MM_PASSWORD)
    tomorrowStudent = await createAuthenticatedClient(TOMORROW_EMAIL, MM_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: now })
        .in('student_id', [todayId, tomorrowId])
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
    if (errors.length > 0) throw new Error(`MM afterEach: ${errors.join('; ')}`)
  })

  test('MM: a code of a not-started sitting is refused until Start', async () => {
    const today = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(today)
    const tomorrow = await createSittingRpc(
      adminClient,
      adminId,
      new Date(Date.now() + 24 * 3600 * 1000),
    )
    track.sittingIds.push(tomorrow)
    const todayCode = await issueOneCode(adminClient, admin, today, todayId, subjectId)
    codeIds.push(todayCode.id)
    const tomorrowCode = await issueOneCode(adminClient, admin, tomorrow, tomorrowId, subjectId)
    codeIds.push(tomorrowCode.id)

    for (const [who, client, code] of [
      ['today', todayStudent, todayCode],
      ['tomorrow', tomorrowStudent, tomorrowCode],
    ] as const) {
      const { data, error } = await client.rpc('start_internal_exam_session', {
        p_code: code.code,
      })
      expect(error?.message ?? `${who}: started ${JSON.stringify(data)}`, who).toMatch(
        /sitting_not_open/,
      )
      expect(await codeConsumed(admin, code.id), who).toBeNull()
    }

    // CONTROL: Start opens today's sitting; the same code now starts a session.
    const st = await adminClient.rpc('start_exam_sitting', { p_sitting_id: today })
    expect(st.error).toBeNull()
    const { data: ok, error: okErr } = await todayStudent.rpc('start_internal_exam_session', {
      p_code: todayCode.code,
    })
    expect(okErr).toBeNull()
    expect(typeof ok?.[0]?.session_id).toBe('string')
    expect(await codeConsumed(admin, todayCode.id)).not.toBeNull()
  })
})
