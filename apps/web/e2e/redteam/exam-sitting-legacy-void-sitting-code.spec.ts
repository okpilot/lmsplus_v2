/**
 * Red Team Spec: void_internal_exam_code reached with a reserved reason or a SITTING code (Vectors NB, NC, #1820)
 *
 * NB: an org admin calls void_internal_exam_code directly (PostgREST) with each reserved void-reason
 * token the sitting RPCs write themselves, and with a whitespace-padded 'sitting_cancelled', on an
 * unused sitting code and on a legacy code (sitting_entry_id NULL). Three readers key on
 * 'sitting_cancelled', so free text equal to one forges a cancellation notice.
 * Expected: every call raises `invalid_input`; both codes stay unvoided with a NULL void_reason and
 * no `internal_exam.code_voided` audit row.
 * NC: the same RPC on an unused code of a day-ended sitting, the state void_sitting_code refuses
 * with `sitting_day_ended`. Expected: `sitting_code`; the code stays unvoided.
 * CONTROL (each test): a free-text reason through the same RPC voids a legacy code (one audit row,
 * void_reason is the free text).
 *
 * Hermetic: throwaway students; sittings carry EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes every
 * code of those students, then cleanupSittingFixtures (per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { skipIfSeededDayEnded, skipNearUtcRollover } from '../helpers/utc-rollover'
import { insertFixtureCode } from './helpers/audit-helpers'
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

const NB_STUDENT_EMAIL = 'redteam-nb-student@lmsplus.local'
const NB_STUDENT_PASSWORD = 'redteam-nb-student-2026!'
const NC_STUDENT_EMAIL = 'redteam-nc-student@lmsplus.local'
const NC_STUDENT_PASSWORD = 'redteam-nc-student-2026!'
const NB_LEGACY_EMAIL = 'redteam-nb-legacy@lmsplus.local'
const NB_LEGACY_PASSWORD = 'redteam-nb-legacy-2026!'
const NC_LEGACY_EMAIL = 'redteam-nc-legacy@lmsplus.local'
const NC_LEGACY_PASSWORD = 'redteam-nc-legacy-2026!'
const NB_FREE_TEXT = '[E2E_REDTEAM_NB] legacy void probe'
// Mirrors RESERVED_VOID_REASONS (packages/db/src/schema.ts) plus a btrim-padded variant.
const RESERVED = [
  'sitting_closed',
  'sitting_cancelled',
  'entry_removed',
  'reissued_after_expiry',
  'passed_elsewhere',
  '  sitting_cancelled  ',
]

async function codeState(admin: Admin, codeId: string, orgId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, voided_at, void_reason')
    .eq('id', codeId)
    .eq('organization_id', orgId)
    .single()
  if (error || !data) throw new Error(`code: ${error?.message}`)
  const { data: audits, error: aErr } = await admin
    .from('audit_events')
    .select('id')
    .eq('event_type', 'internal_exam.code_voided')
    .eq('resource_id', codeId)
    .eq('organization_id', orgId)
  if (aErr || !audits) throw new Error(`audit: ${aErr?.message}`)
  return { voided: data.voided_at !== null, reason: data.void_reason, audits: audits.length }
}

const UNTOUCHED = { voided: false, reason: null, audits: 0 }

test.describe('Red Team: legacy void_internal_exam_code reserved reason and sitting code (NB, NC)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let orgId: string
  let studentIds: string[] = []
  let openCodeId: string
  let endedSittingId: string
  let endedCodeId: string
  let nbLegacyCodeId: string
  let ncLegacyCodeId: string
  let seededAt: Date
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  /** A sitting with one candidate, one entry and one issued code; returns both ids. Each sitting
   *  needs its own student: a second entry for the same subject on the same UTC day is skipped. */
  async function seedCodedSitting(a: {
    adminUserId: string
    subjectId: string
    studentId: string
  }) {
    const { adminUserId, subjectId, studentId } = a
    const sittingId = await createSittingRpc(egmontAdmin, adminUserId)
    track.sittingIds.push(sittingId)
    const add = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
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
    const { data: codes, error: cErr } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('student_id', studentId)
      .eq('organization_id', orgId)
      .not('sitting_entry_id', 'is', null)
      .is('voided_at', null)
      .is('deleted_at', null)
    if (cErr || codes?.length !== 1) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
    return { sittingId, codeId: codes[0]?.id as string }
  }

  test.beforeEach(() => {
    skipNearUtcRollover()
    skipIfSeededDayEnded(seededAt)
  })

  test.beforeAll(async () => {
    admin = getAdminClient()
    skipNearUtcRollover()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    orgId = a.orgId
    studentIds = [
      await upsertUser(admin, NB_STUDENT_EMAIL, NB_STUDENT_PASSWORD, a.orgId),
      await upsertUser(admin, NC_STUDENT_EMAIL, NC_STUDENT_PASSWORD, a.orgId),
      await upsertUser(admin, NB_LEGACY_EMAIL, NB_LEGACY_PASSWORD, a.orgId),
      await upsertUser(admin, NC_LEGACY_EMAIL, NC_LEGACY_PASSWORD, a.orgId),
    ]
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)

    const open = await seedCodedSitting({
      adminUserId: a.adminUserId,
      subjectId: picked.subjectId,
      studentId: studentIds[0] as string,
    })
    seededAt = new Date()
    openCodeId = open.codeId

    const ended = await seedCodedSitting({
      adminUserId: a.adminUserId,
      subjectId: picked.subjectId,
      studentId: studentIds[1] as string,
    })
    endedSittingId = ended.sittingId
    endedCodeId = ended.codeId
    // Scheduled two days ago, never started, never closed: day-ended but live. The issue RPC
    // refuses that state, so the fixture is built today and then dated back.
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const { data: moved, error: mErr } = await admin
      .from('exam_sittings')
      .update({ scheduled_at: past })
      .eq('id', endedSittingId)
      .select('id')
    if (mErr || !moved?.length) throw new Error(`date back: ${mErr?.message ?? '0 rows'}`)

    const legacy = (studentId: string) =>
      insertFixtureCode(
        admin,
        { orgId: a.orgId, subjectId: picked.subjectId, studentId, issuedBy: a.adminUserId },
        new Set<string>(),
      )
    nbLegacyCodeId = (await legacy(studentIds[2] as string)).codeId
    ncLegacyCodeId = (await legacy(studentIds[3] as string)).codeId
  })

  test.afterAll(async () => {
    const errors: string[] = []
    // Only when `beforeAll` reached the org and student seeds: `organization_id=eq.undefined`
    // raises 22P02, and accumulating that would bury the real cause.
    const ids = studentIds.filter(Boolean)
    if (orgId && ids.length > 0) {
      try {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('student_id', ids)
          .eq('organization_id', orgId)
          .is('deleted_at', null)
        if (error) throw new Error(`codes: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NB/NC afterAll: ${errors.join('; ')}`)
  })

  test('NB: a reserved void reason cannot be written through the legacy RPC', async () => {
    for (const codeId of [openCodeId, nbLegacyCodeId]) {
      expect(await codeState(admin, codeId, orgId)).toEqual(UNTOUCHED)
      for (const reason of RESERVED) {
        const forge = await egmontAdmin.rpc('void_internal_exam_code', {
          p_code_id: codeId,
          p_reason: reason,
        })
        expect(
          forge.error?.message ?? `no error ${JSON.stringify(forge.data)}`,
          `reserved ${JSON.stringify(reason)} on ${codeId}`,
        ).toMatch(/invalid_input/)
      }
      expect(await codeState(admin, codeId, orgId)).toEqual(UNTOUCHED)
    }

    // CONTROL: free text through the same RPC voids the same legacy code.
    const ok = await egmontAdmin.rpc('void_internal_exam_code', {
      p_code_id: nbLegacyCodeId,
      p_reason: NB_FREE_TEXT,
    })
    expect(ok.error).toBeNull()
    expect(await codeState(admin, nbLegacyCodeId, orgId)).toEqual({
      voided: true,
      reason: NB_FREE_TEXT,
      audits: 1,
    })
  })

  test('NC: a day-ended sitting code cannot be voided through the legacy RPC', async () => {
    expect(await codeState(admin, endedCodeId, orgId)).toEqual(UNTOUCHED)

    // The sitting-scoped RPC refuses the day-ended sitting.
    const scoped = await egmontAdmin.rpc('void_sitting_code', {
      p_sitting_id: endedSittingId,
      p_code_id: endedCodeId,
      p_reason: NB_FREE_TEXT,
    })
    expect(scoped.error?.message ?? 'no error').toMatch(/sitting_day_ended/)

    const legacy = await egmontAdmin.rpc('void_internal_exam_code', {
      p_code_id: endedCodeId,
      p_reason: NB_FREE_TEXT,
    })
    expect(
      legacy.error?.message ?? `no error ${JSON.stringify(legacy.data)}`,
      'legacy RPC must refuse a day-ended sitting code',
    ).toMatch(/sitting_code/)
    expect(await codeState(admin, endedCodeId, orgId)).toEqual(UNTOUCHED)

    // CONTROL: the same RPC and reason void a legacy code.
    const ok = await egmontAdmin.rpc('void_internal_exam_code', {
      p_code_id: ncLegacyCodeId,
      p_reason: NB_FREE_TEXT,
    })
    expect(ok.error).toBeNull()
    expect(await codeState(admin, ncLegacyCodeId, orgId)).toEqual({
      voided: true,
      reason: NB_FREE_TEXT,
      audits: 1,
    })
  })
})
