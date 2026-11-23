/**
 * Red Team Spec: sitting redeem gate — prior pass and overdue attempt (Vectors MO, MP, #1777)
 *
 * MO attack: the student passes the subject after Start (the prune already ran), then redeems the
 * open sitting's code for the same subject.
 * Expected: `already_passed`; no new session; code unconsumed.
 * CONTROL: the pass's consumed code is voided (annulled attempt) — the same code starts a session.
 *
 * MP attack: the student holds an unfinished overdue same-subject attempt that grades as a pass,
 * then redeems the open sitting's code for a fresh attempt before that pass is recorded.
 * Expected: `already_passed`; the redeem's auto-complete rolls back; code unconsumed.
 * CONTROL: a legacy code (no sitting entry) auto-completes the same overdue attempt.
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
import { E2E_REDTEAM_SIT_REDEEM_MARKER } from './helpers/seed-markers'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ADMIN_EMAIL, ADMIN_PASSWORD, seedRedTeamAdmin } from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const MO_EMAIL = 'redteam-mo-passed@lmsplus.local'
const MP_EMAIL = 'redteam-mp-overdue@lmsplus.local'
const MOP_PASSWORD = 'redteam-mop-student-2026!'

async function openSittingCode(
  adminClient: SupabaseClient,
  admin: Admin,
  adminId: string,
  track: SittingTrack,
  userId: string,
  subjectId: string,
): Promise<{ id: string; code: string }> {
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
  const iss = await adminClient.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
  if (iss.error) throw new Error(`issue: ${iss.error.message}`)
  expect(iss.data?.[0]?.issued, JSON.stringify(iss.data)).toBe(1)
  const st = await adminClient.rpc('start_exam_sitting', { p_sitting_id: sittingId })
  if (st.error) throw new Error(`start: ${st.error.message}`)
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

type StartRow = {
  session_id: string
  question_ids: string[]
  time_limit_seconds: number
  total_questions: number
  pass_mark: number
  started_at: string
}

async function expectStartPayload(
  admin: Admin,
  orgId: string,
  subjectId: string,
  rows: StartRow[] | null,
): Promise<string> {
  const { data: cfg, error } = await admin
    .from('exam_configs')
    .select('total_questions, time_limit_seconds, pass_mark')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .single()
  if (error || !cfg) throw new Error(`exam config read: ${error?.message}`)
  expect(rows).toHaveLength(1)
  const row = rows?.[0]
  if (!row) throw new Error('no start row')
  expect(typeof row.session_id).toBe('string')
  expect(Array.isArray(row.question_ids)).toBe(true)
  expect(row.question_ids.length).toBeGreaterThan(0)
  expect(row.question_ids.every((q) => typeof q === 'string')).toBe(true)
  expect(row.total_questions).toBe(cfg.total_questions)
  expect(row.question_ids).toHaveLength(row.total_questions)
  expect(row.time_limit_seconds).toBe(cfg.time_limit_seconds)
  expect(row.pass_mark).toBe(cfg.pass_mark)
  const startedMs = Date.parse(row.started_at)
  expect(Number.isNaN(startedMs)).toBe(false)
  expect(Math.abs(Date.now() - startedMs)).toBeLessThan(5 * 60 * 1000)
  return row.session_id
}

async function softDeleteSittingCodes(
  admin: Admin,
  sittingIds: string[],
  now: string,
): Promise<number> {
  if (sittingIds.length === 0) return 0
  const { data: entries, error: eErr } = await admin
    .from('exam_sitting_entries')
    .select('id')
    .in('sitting_id', sittingIds)
  if (eErr) throw new Error(`sitting entries: ${eErr.message}`)
  const entryIds = (entries ?? []).map((e) => e.id as string)
  if (entryIds.length === 0) return 0
  const { data, error } = await admin
    .from('internal_exam_codes')
    .update({ deleted_at: now })
    .in('sitting_entry_id', entryIds)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`sitting codes: ${error.message}`)
  return data?.length ?? 0
}

async function readCode(
  admin: Admin,
  codeId: string,
): Promise<{ consumed_at: string | null; consumed_session_id: string | null }> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('consumed_at, consumed_session_id')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code read: ${error?.message}`)
  return data
}

async function sessionEndedAt(admin: Admin, sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('ended_at')
    .eq('id', sessionId)
    .single()
  if (error || !data) throw new Error(`session read: ${error?.message}`)
  return data.ended_at as string | null
}

test.describe('Red Team: sitting redeem gate — prior pass and overdue attempt (MO, MP)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let moStudent: SupabaseClient
  let mpStudent: SupabaseClient
  let adminId: string
  let orgId: string
  let moId: string
  let mpId: string
  let subjectId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    orgId = a.orgId
    track.adminId = adminId
    moId = await upsertUser(admin, MO_EMAIL, MOP_PASSWORD, orgId)
    mpId = await upsertUser(admin, MP_EMAIL, MOP_PASSWORD, orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(orgId, subjectId, picked.topicId)
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    moStudent = await createAuthenticatedClient(MO_EMAIL, MOP_PASSWORD)
    mpStudent = await createAuthenticatedClient(MP_EMAIL, MOP_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    const sittingIds = [...track.sittingIds]
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: now })
        .in('student_id', [moId, mpId])
        .eq('mode', 'internal_exam')
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`sessions: ${error.message}`)
      if (data && data.length > 0) console.log(`afterEach: soft-deleted ${data.length} session(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (codeIds.length > 0) {
        const { data, error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: now })
          .in('id', codeIds)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`codes: ${error.message}`)
        if (data && data.length > 0) console.log(`afterEach: soft-deleted ${data.length} code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      codeIds.length = 0
    }
    try {
      const n = await softDeleteSittingCodes(admin, sittingIds, now)
      if (n > 0) console.log(`afterEach: soft-deleted ${n} sitting code(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`MO/MP afterEach: ${errors.join('; ')}`)
  })

  test('MO: a sitting code is refused once the subject is passed after Start', async () => {
    const code = await openSittingCode(adminClient, admin, adminId, track, moId, subjectId)
    codeIds.push(code.id)

    const endedAt = new Date().toISOString()
    const { data: passRow, error: passErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: moId,
        mode: 'internal_exam',
        subject_id: subjectId,
        config: { question_ids: [], pass_mark: 75, e2e_marker: E2E_REDTEAM_SIT_REDEEM_MARKER },
        total_questions: 1,
        time_limit_seconds: 600,
        started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        ended_at: endedAt,
        passed: true,
      })
      .select('id')
      .single()
    if (passErr || !passRow) throw new Error(`MO pass seed: ${passErr?.message}`)
    const { data: passCode, error: pcErr } = await admin
      .from('internal_exam_codes')
      .insert({
        code: `${E2E_REDTEAM_SIT_REDEEM_MARKER}${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        subject_id: subjectId,
        student_id: moId,
        issued_by: adminId,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        organization_id: orgId,
        consumed_at: endedAt,
        consumed_session_id: passRow.id,
      })
      .select('id')
      .single()
    if (pcErr || !passCode) throw new Error(`MO pass code seed: ${pcErr?.message}`)
    codeIds.push(passCode.id)

    const { data, error } = await moStudent.rpc('start_internal_exam_session', {
      p_code: code.code,
    })
    expect(error?.message ?? `started ${JSON.stringify(data)}`).toMatch(/already_passed/)
    expect((await readCode(admin, code.id)).consumed_at).toBeNull()

    // CONTROL: the pass's code is voided (annulled attempt) — the same sitting code now redeems.
    const { error: vErr } = await admin
      .from('internal_exam_codes')
      .update({
        voided_at: new Date().toISOString(),
        voided_by: adminId,
        void_reason: 'redteam-mo',
      })
      .eq('id', passCode.id)
    expect(vErr).toBeNull()
    const { data: ok, error: okErr } = await moStudent.rpc('start_internal_exam_session', {
      p_code: code.code,
    })
    expect(okErr).toBeNull()
    const okSessionId = await expectStartPayload(admin, orgId, subjectId, ok)
    expect((await readCode(admin, code.id)).consumed_session_id).toBe(okSessionId)
  })

  test('MP: an overdue attempt that grades as a pass blocks a sitting code', async () => {
    const code = await openSittingCode(adminClient, admin, adminId, track, mpId, subjectId)
    codeIds.push(code.id)

    const { data: overdue, error: oErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: mpId,
        mode: 'internal_exam',
        subject_id: subjectId,
        config: { question_ids: [], pass_mark: 75, e2e_marker: E2E_REDTEAM_SIT_REDEEM_MARKER },
        total_questions: 1,
        time_limit_seconds: 600,
        started_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (oErr || !overdue) throw new Error(`MP overdue seed: ${oErr?.message}`)
    const { data: q, error: qErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (qErr || !q) throw new Error(`MP question: ${qErr?.message}`)
    const { error: aErr } = await admin.from('quiz_session_answers').insert({
      session_id: overdue.id,
      question_id: q.id,
      selected_option_id: 'a',
      response_time_ms: 1000,
      is_correct: true,
    })
    if (aErr) throw new Error(`MP answer seed: ${aErr.message}`)
    const { error: cfgErr } = await admin
      .from('quiz_sessions')
      .update({
        config: { question_ids: [q.id], pass_mark: 75, e2e_marker: E2E_REDTEAM_SIT_REDEEM_MARKER },
      })
      .eq('id', overdue.id)
    if (cfgErr) throw new Error(`MP config seed: ${cfgErr.message}`)

    const { data, error } = await mpStudent.rpc('start_internal_exam_session', {
      p_code: code.code,
    })
    expect(error?.message ?? `started ${JSON.stringify(data)}`).toMatch(/already_passed/)
    expect(await sessionEndedAt(admin, overdue.id)).toBeNull()
    expect((await readCode(admin, code.id)).consumed_at).toBeNull()

    // CONTROL: a legacy code (no sitting entry) auto-completes the same overdue attempt.
    const { data: legacy, error: lErr } = await admin
      .from('internal_exam_codes')
      .insert({
        code: `${E2E_REDTEAM_SIT_REDEEM_MARKER}${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        subject_id: subjectId,
        student_id: mpId,
        issued_by: adminId,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        organization_id: orgId,
      })
      .select('id, code')
      .single()
    if (lErr || !legacy) throw new Error(`MP legacy code seed: ${lErr?.message}`)
    codeIds.push(legacy.id)
    const { data: ok, error: okErr } = await mpStudent.rpc('start_internal_exam_session', {
      p_code: legacy.code,
    })
    expect(okErr).toBeNull()
    await expectStartPayload(admin, orgId, subjectId, ok)
    expect(await sessionEndedAt(admin, overdue.id)).not.toBeNull()
  })
})
