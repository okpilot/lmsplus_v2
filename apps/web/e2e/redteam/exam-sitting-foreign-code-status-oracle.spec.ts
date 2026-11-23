/**
 * Red Team Spec: a foreign sitting code reveals no sitting state (Vector MV, #1777)
 *
 * Attack: student B redeems student A's sitting code before and after Start.
 * Expected: `code_not_yours` both times (never `sitting_not_open`); no session for B; code unconsumed.
 * CONTROL: A gets `sitting_not_open` before Start and starts a session after Start.
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

const OWNER_EMAIL = 'redteam-mv-owner@lmsplus.local'
const FOREIGN_EMAIL = 'redteam-mv-foreign@lmsplus.local'
const MV_PASSWORD = 'redteam-mv-student-2026!'

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

async function liveExamSessions(admin: Admin, studentId: string): Promise<number> {
  const { count, error } = await admin
    .from('quiz_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('mode', 'internal_exam')
    .is('deleted_at', null)
  if (error) throw new Error(`sessions read: ${error.message}`)
  return count ?? 0
}

test.describe('Red Team: foreign sitting code status oracle (MV)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let owner: SupabaseClient
  let foreign: SupabaseClient
  let adminId: string
  let ownerId: string
  let foreignId: string
  let subjectId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    track.adminId = adminId
    ownerId = await upsertUser(admin, OWNER_EMAIL, MV_PASSWORD, a.orgId)
    foreignId = await upsertUser(admin, FOREIGN_EMAIL, MV_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(a.orgId, subjectId, picked.topicId)
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    owner = await createAuthenticatedClient(OWNER_EMAIL, MV_PASSWORD)
    foreign = await createAuthenticatedClient(FOREIGN_EMAIL, MV_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: now })
        .in('student_id', [ownerId, foreignId])
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
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      codeIds.length = 0
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`MV afterEach: ${errors.join('; ')}`)
  })

  test('MV: a foreign sitting code yields code_not_yours before and after Start', async () => {
    const sittingId = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(sittingId)
    const code = await issueOneCode(adminClient, admin, sittingId, ownerId, subjectId)
    codeIds.push(code.id)

    const pre = await foreign.rpc('start_internal_exam_session', { p_code: code.code })
    expect(pre.error?.message ?? `foreign pre: ${JSON.stringify(pre.data)}`).toMatch(
      /code_not_yours/,
    )

    // CONTROL: the owner sees the gate before Start.
    const ownerPre = await owner.rpc('start_internal_exam_session', { p_code: code.code })
    expect(ownerPre.error?.message ?? `owner pre: ${JSON.stringify(ownerPre.data)}`).toMatch(
      /sitting_not_open/,
    )

    const st = await adminClient.rpc('start_exam_sitting', { p_sitting_id: sittingId })
    expect(st.error).toBeNull()

    const post = await foreign.rpc('start_internal_exam_session', { p_code: code.code })
    expect(post.error?.message ?? `foreign post: ${JSON.stringify(post.data)}`).toMatch(
      /code_not_yours/,
    )
    expect(await codeConsumed(admin, code.id)).toBeNull()
    expect(await liveExamSessions(admin, foreignId)).toBe(0)

    // CONTROL: the owner starts after Start.
    const ownerPost = await owner.rpc('start_internal_exam_session', { p_code: code.code })
    expect(ownerPost.error).toBeNull()
    expect(ownerPost.data).toHaveLength(1)
    expect(await codeConsumed(admin, code.id)).not.toBeNull()
    expect(await liveExamSessions(admin, ownerId)).toBe(1)
  })
})
