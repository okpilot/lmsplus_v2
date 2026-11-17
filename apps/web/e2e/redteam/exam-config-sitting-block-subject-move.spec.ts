/**
 * Red Team Spec: exam config in-use block vs a subject_id move (Vector MH, #1777)
 *
 * MH: an admin holds table-level UPDATE on exam_configs, so a direct
 * `UPDATE exam_configs SET subject_id = <other>` (alone, or with enabled = false) could detach the
 * config from a subject a scheduled sitting uses. Expected: `exam_config_in_use`, config unchanged.
 * CONTROL: `enabled = false` is refused while the entry is live; the same move succeeds once the
 * entry is soft-deleted.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; subjects carry E2E_REDTEAM_SIT_SUBJECT_PREFIX;
 * afterEach soft-deletes the tracked entries, sittings, configs, subjects (accumulator in cleanupSittingFixtures).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  insertEntry,
  insertMarkedSubject,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamStudent,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

async function configRow(admin: Admin, id: string) {
  const { data, error } = await admin
    .from('exam_configs')
    .select('subject_id, enabled, deleted_at')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`exam_configs read: ${error?.message}`)
  return data
}

test.describe('Red Team: exam config sitting block vs subject_id move (MH)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let orgId: string
  let adminId: string
  let studentId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    const s = await seedRedTeamStudent()
    orgId = a.orgId
    adminId = a.adminUserId
    studentId = s.victimUserId
    track.adminId = adminId
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test.afterEach(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('MH: moving an in-use exam config to another subject is refused', async () => {
    const subjectA = await insertMarkedSubject(admin)
    const subjectB = await insertMarkedSubject(admin)
    const subjectC = await insertMarkedSubject(admin)
    track.subjectIds.push(subjectA, subjectB, subjectC)
    const { data: cfg, error: cfgErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectA,
        enabled: true,
        total_questions: 10,
        time_limit_seconds: 3600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (cfgErr || !cfg) throw new Error(`exam_configs insert: ${cfgErr?.message}`)
    const sittingId = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(sittingId)
    const entryId = await insertEntry(admin, {
      orgId,
      sittingId,
      userId: studentId,
      subjectId: subjectA,
    })

    // CONTROL: the guard fires on the disable path.
    const disable = await adminClient
      .from('exam_configs')
      .update({ enabled: false })
      .eq('id', cfg.id)
      .select('id')
    expect(disable.error?.message ?? '').toMatch(/exam_config_in_use/)

    // ATTACK 1: subject_id move alone.
    const move = await adminClient
      .from('exam_configs')
      .update({ subject_id: subjectB })
      .eq('id', cfg.id)
      .select('id')
    expect(move.error?.message ?? '').toMatch(/exam_config_in_use/)

    // ATTACK 2: subject_id move together with enabled = false.
    const moveDisable = await adminClient
      .from('exam_configs')
      .update({ subject_id: subjectC, enabled: false })
      .eq('id', cfg.id)
      .select('id')
    expect(moveDisable.error?.message ?? '').toMatch(/exam_config_in_use/)

    const after = await configRow(admin, cfg.id)
    expect(after.subject_id).toBe(subjectA)
    expect(after.enabled).toBe(true)

    // CONTROL: with the entry soft-deleted the same move goes through.
    const { error: entErr } = await admin
      .from('exam_sitting_entries')
      .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
      .eq('id', entryId)
    if (entErr) throw new Error(`entry soft-delete: ${entErr.message}`)
    const free = await adminClient
      .from('exam_configs')
      .update({ subject_id: subjectB })
      .eq('id', cfg.id)
      .select('id')
    expect(free.error).toBeNull()
    expect(free.data).toHaveLength(1)
    expect((await configRow(admin, cfg.id)).subject_id).toBe(subjectB)
  })
})
