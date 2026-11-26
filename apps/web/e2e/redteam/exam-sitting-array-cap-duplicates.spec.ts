/**
 * Red Team Spec: duplicate-inflated id arrays against the sitting RPC caps (Vector NK)
 *
 * Attack: `add_exam_sitting_candidates` and `issue_sitting_exam_codes` cap `cardinality` AFTER
 * `SELECT DISTINCT`, so a direct PostgREST caller (bypassing `uuidList(500)` in
 * `AddSittingCandidatesSchema` / `IssueSittingCodesSchema`) can post an arbitrarily long array.
 * Expected: duplicates collapse — one live `exam_sitting_candidates` row per (sitting, user) and
 * one live `internal_exam_codes` row per entry — and a repeated call adds nothing.
 * CONTROL: the distinct cap still fires — 501 distinct ids raise `invalid_input` before the student
 * lookup, while the same bogus ids at 500 distinct reach it and raise `student_not_found`.
 *
 * Hermetic: throwaway student, sitting carries the E2E sitting marker; afterAll soft-deletes the
 * created codes, then cleanupSittingFixtures (per-step accumulator).
 */

import { randomUUID } from 'node:crypto'
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

const NK_STUDENT_EMAIL = 'redteam-nk-student@lmsplus.local'
const NK_STUDENT_PASSWORD = 'redteam-nk-student-2026!'
/** Duplicate count: ~740KB of JSON, well past the 500-element app cap. */
const DUPES = 20_000

async function liveCandidateCount(admin: Admin, sittingId: string, userId: string) {
  const { count, error } = await admin
    .from('exam_sitting_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('sitting_id', sittingId)
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) throw new Error(`candidate count: ${error.message}`)
  return count ?? -1
}

async function liveCodeCount(admin: Admin, entryId: string) {
  const { count, error } = await admin
    .from('internal_exam_codes')
    .select('id', { count: 'exact', head: true })
    .eq('sitting_entry_id', entryId)
    .is('voided_at', null)
    .is('deleted_at', null)
  if (error) throw new Error(`code count: ${error.message}`)
  return count ?? -1
}

test.describe.configure({ mode: 'serial' })

test.describe('Red Team: duplicate-inflated sitting id arrays (NK)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let studentId: string
  let subjectId: string
  let sittingId: string
  let entryId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NK_STUDENT_EMAIL, NK_STUDENT_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(a.orgId, subjectId, picked.topicId)
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(sittingId)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    // Only when `beforeAll` reached the student seed: `eq('student_id', undefined)` raises 22P02,
    // and accumulating that would bury the real cause.
    if (studentId) {
      try {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', studentId)
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
    if (errors.length > 0) throw new Error(`NK afterAll: ${errors.join('; ')}`)
  })

  test('NK1: a duplicate-inflated candidate array adds the student exactly once', async () => {
    expect(await liveCandidateCount(admin, sittingId, studentId)).toBe(0)

    const first = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: Array.from({ length: DUPES }, () => studentId),
    })
    expect(first.error?.message ?? null).toBeNull()
    expect(first.data?.[0]?.added, JSON.stringify(first.data)).toBe(1)
    expect(await liveCandidateCount(admin, sittingId, studentId)).toBe(1)

    // Replay: the partial unique index + ON CONFLICT DO NOTHING must not add a second live row.
    const replay = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: Array.from({ length: DUPES }, () => studentId),
    })
    expect(replay.error?.message ?? null).toBeNull()
    expect(replay.data?.[0]?.added, JSON.stringify(replay.data)).toBe(0)
    expect(replay.data?.[0]?.skipped_existing, JSON.stringify(replay.data)).toBe(1)
    expect(await liveCandidateCount(admin, sittingId, studentId)).toBe(1)
  })

  test('NK2: a duplicate-inflated issue array issues exactly one code for the entry', async () => {
    const ent = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
      p_subject_ids: [subjectId],
    })
    expect(ent.error?.message ?? null).toBeNull()
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(1)
    const { data: entry, error: entryErr } = await admin
      .from('exam_sitting_entries')
      .select('id')
      .eq('sitting_id', sittingId)
      .eq('user_id', studentId)
      .is('deleted_at', null)
      .single()
    if (entryErr || !entry) throw new Error(`entry: ${entryErr?.message}`)
    entryId = entry.id
    expect(await liveCodeCount(admin, entryId)).toBe(0)

    const iss = await egmontAdmin.rpc('issue_sitting_exam_codes', {
      p_sitting_id: sittingId,
      p_user_ids: Array.from({ length: DUPES }, () => studentId),
    })
    expect(iss.error?.message ?? null).toBeNull()
    expect(iss.data?.[0]?.issued, JSON.stringify(iss.data)).toBe(1)
    expect(await liveCodeCount(admin, entryId)).toBe(1)

    // Replay: one live code per entry, counted as already issued, never a second code.
    const replay = await egmontAdmin.rpc('issue_sitting_exam_codes', {
      p_sitting_id: sittingId,
      p_user_ids: Array.from({ length: DUPES }, () => studentId),
    })
    expect(replay.error?.message ?? null).toBeNull()
    expect(replay.data?.[0]?.issued, JSON.stringify(replay.data)).toBe(0)
    expect(replay.data?.[0]?.skipped_already_issued, JSON.stringify(replay.data)).toBe(1)
    expect(await liveCodeCount(admin, entryId)).toBe(1)
  })

  test('NK3: the distinct cap fires at 501 ids and not at 500 (control)', async () => {
    const bogus = Array.from({ length: 500 }, () => randomUUID())

    const over = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      // 501 distinct: 500 bogus + the real student, each repeated — the cap counts distinct ids.
      p_user_ids: [...bogus, studentId, ...bogus, studentId],
    })
    expect(over.error?.message ?? `no error ${JSON.stringify(over.data)}`).toMatch(/invalid_input/)

    // CONTROL: the same bogus ids at 500 distinct pass the cap and reach the student lookup.
    const under = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [...bogus.slice(0, 499), studentId, ...bogus.slice(0, 499)],
    })
    expect(under.error?.message ?? `no error ${JSON.stringify(under.data)}`).toMatch(
      /student_not_found/,
    )
    expect(await liveCandidateCount(admin, sittingId, studentId)).toBe(1)
  })
})
