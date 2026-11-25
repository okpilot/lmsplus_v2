/**
 * Red Team Spec: void_internal_exam_code reached with a SITTING code (Vectors NB, NC, #1777)
 *
 * void_sitting_code (mig 20261118000300) guards a sitting code two ways: it refuses the five
 * reserved void-reason tokens the sitting RPCs write themselves, and it locks the sitting through
 * private.sitting_lock(..., true), which refuses a closed or day-ended sitting. The legacy sibling
 * void_internal_exam_code (mig 20260601000003) carries neither guard and is GRANTed to
 * authenticated, so an org admin reaches the same rows through it.
 *
 * NB: the legacy RPC must refuse 'sitting_cancelled' as a free-text reason for a code attached to a
 * sitting entry — three readers (migs 20261117001000, 20261117001100, 20261117001200) key on that
 * token, so writing it forges a cancellation notice for the code's student (#1820).
 * NC: the legacy RPC must refuse a code of a day-ended sitting, the state void_sitting_code rejects
 * with `sitting_day_ended`.
 *
 * Both tests are named for the behaviour that SHOULD hold and FAIL against current code.
 * SKIP REASON: proven exploit, no fix in this branch — NB is filed as #1820. Un-skip in the commit
 * that guards the legacy RPC for sitting-attached codes.
 *
 * Hermetic: a throwaway student, sittings carrying EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes
 * the created sitting codes, then cleanupSittingFixtures (per-step accumulator).
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
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NB_STUDENT_EMAIL = 'redteam-nb-student@lmsplus.local'
const NB_STUDENT_PASSWORD = 'redteam-nb-student-2026!'
const NC_STUDENT_EMAIL = 'redteam-nc-student@lmsplus.local'
const NC_STUDENT_PASSWORD = 'redteam-nc-student-2026!'
const NB_FREE_TEXT = '[E2E_REDTEAM_NB] legacy void probe'

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, voided_at, void_reason')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code: ${error?.message}`)
  return { voided: data.voided_at !== null, reason: data.void_reason }
}

test.describe
  .skip('Red Team: legacy void_internal_exam_code on a sitting code (NB, NC)', () => {
    let admin: Admin
    let egmontAdmin: SupabaseClient
    let studentIds: string[]
    let openSittingId: string
    let openCodeId: string
    let endedSittingId: string
    let endedCodeId: string
    const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

    /** A sitting with one candidate, one entry and one issued, emailed code; returns both ids.
     *  Each sitting needs its own student: a second entry for the same subject on the same UTC day
     *  is skipped as `entered_elsewhere`. */
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
      const { data: entries, error: eErr } = await admin
        .from('exam_sitting_entries')
        .select('id')
        .eq('sitting_id', sittingId)
        .is('deleted_at', null)
      if (eErr || entries?.length !== 1)
        throw new Error(`entries: ${eErr?.message ?? entries?.length}`)
      // emailed_at is what makes a cancelled sitting's code a pending notice (mig 20261117001000).
      const { data: codes, error: cErr } = await admin
        .from('internal_exam_codes')
        .update({ emailed_at: new Date().toISOString() })
        .eq('sitting_entry_id', entries[0]?.id as string)
        .is('voided_at', null)
        .is('deleted_at', null)
        .select('id')
      if (cErr || codes?.length !== 1) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
      return { sittingId, codeId: codes[0]?.id as string }
    }

    test.beforeAll(async () => {
      admin = getAdminClient()
      await seedRedTeamUsers()
      const a = await seedRedTeamAdmin()
      track.adminId = a.adminUserId
      studentIds = [
        await upsertUser(admin, NB_STUDENT_EMAIL, NB_STUDENT_PASSWORD, a.orgId),
        await upsertUser(admin, NC_STUDENT_EMAIL, NC_STUDENT_PASSWORD, a.orgId),
      ]
      const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
      await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)
      egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)

      const open = await seedCodedSitting({
        adminUserId: a.adminUserId,
        subjectId: picked.subjectId,
        studentId: studentIds[0] as string,
      })
      openSittingId = open.sittingId
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
    })

    test.afterAll(async () => {
      const errors: string[] = []
      try {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('student_id', studentIds)
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
      if (errors.length > 0) throw new Error(`NB/NC afterAll: ${errors.join('; ')}`)
    })

    test('NB: a system void reason cannot be written to a sitting code through the legacy RPC', async () => {
      expect(await codeState(admin, openCodeId)).toEqual({ voided: false, reason: null })

      const forge = await egmontAdmin.rpc('void_internal_exam_code', {
        p_code_id: openCodeId,
        p_reason: 'sitting_cancelled',
      })
      expect(
        forge.error?.message ?? `no error ${JSON.stringify(forge.data)}`,
        'legacy RPC must refuse a reserved sitting token',
      ).toMatch(/invalid_reason|invalid_input/)
      expect(await codeState(admin, openCodeId)).toEqual({ voided: false, reason: null })

      // CONTROL: the token is what is refused — free text through the same RPC voids the same code.
      const ok = await egmontAdmin.rpc('void_internal_exam_code', {
        p_code_id: openCodeId,
        p_reason: NB_FREE_TEXT,
      })
      expect(ok.error).toBeNull()
      expect(await codeState(admin, openCodeId)).toEqual({ voided: true, reason: NB_FREE_TEXT })

      // A code voided for an admin's own reason is never a cancellation notice for its student.
      const cancel = await egmontAdmin.rpc('cancel_exam_sitting', { p_sitting_id: openSittingId })
      expect(cancel.error).toBeNull()
      const notices = await egmontAdmin.rpc('get_pending_removal_notices', {
        p_sitting_id: openSittingId,
      })
      expect(notices.error).toBeNull()
      expect(
        (notices.data ?? []).filter((n: { code_id: string | null }) => n.code_id === openCodeId),
      ).toEqual([])
    })

    test('NC: a day-ended sitting code cannot be voided through the legacy RPC', async () => {
      expect(await codeState(admin, endedCodeId)).toEqual({ voided: false, reason: null })

      // The guard that exists: the sitting-scoped RPC refuses the day-ended sitting.
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
        'legacy RPC must refuse a day-ended sitting',
      ).toMatch(/sitting_day_ended|sitting_not_found|code_not_found/)
      expect(await codeState(admin, endedCodeId)).toEqual({ voided: false, reason: null })
    })
  })
