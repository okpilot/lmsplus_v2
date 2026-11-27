/**
 * Red Team Spec: GDPR export exam sitting sections under a student JWT (Vector NM, #1777)
 *
 * NM: a student runs the export fetchers (fetchExamSittingCandidacies, fetchExamSittingEntries)
 * for itself and for a peer, and probes exam_sittings through an !inner embed filter.
 * Expected: own live rows only, sitting date/mode/status null, removed rows absent, peer rows
 * absent, the !inner oracle returns 0 rows.
 * CONTROL: the service-role client (admin export path) returns the removed rows and resolves
 * date/mode/status; the student reads its own live rows.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; afterEach soft-deletes the tracked entries,
 * candidates and sittings (cleanupSittingFixtures, per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchExamSittingCandidacies,
  fetchExamSittingEntries,
} from '../../lib/gdpr/collect-user-data-queries'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  insertEntry,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamStudent,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

test.describe('Red Team: GDPR export exam sitting scope (NM)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let attacker: SupabaseClient
  let orgId: string
  let adminId: string
  let attackerId: string
  let victimId: string
  let subjectId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const v = await seedRedTeamStudent()
    orgId = a.orgId
    adminId = a.adminUserId
    attackerId = users.attackerUserId
    victimId = v.victimUserId
    track.adminId = adminId
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const { data: subj, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id')
      .is('deleted_at', null)
      .order('sort_order')
      .limit(1)
      .single()
    if (subjErr || !subj) throw new Error(`easa_subjects: ${subjErr?.message}`)
    subjectId = subj.id
  })

  test.afterEach(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('NM: a student export holds only its own live sitting rows and no sitting details', async () => {
    const liveSitting = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(liveSitting)
    const removedSitting = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(removedSitting)
    for (const sid of [liveSitting, removedSitting]) {
      const { error } = await adminClient.rpc('add_exam_sitting_candidates', {
        p_sitting_id: sid,
        p_user_ids: [attackerId, victimId],
      })
      if (error) throw new Error(`add candidates: ${error.message}`)
    }
    const ownEntry = await insertEntry(admin, {
      orgId,
      sittingId: liveSitting,
      userId: attackerId,
      subjectId,
    })
    await insertEntry(admin, { orgId, sittingId: liveSitting, userId: victimId, subjectId })
    const removedEntry = await insertEntry(admin, {
      orgId,
      sittingId: removedSitting,
      userId: attackerId,
      subjectId,
    })
    const { error: rmErr } = await adminClient.rpc('remove_exam_sitting_candidates', {
      p_sitting_id: removedSitting,
      p_user_ids: [attackerId],
    })
    if (rmErr) throw new Error(`remove candidates: ${rmErr.message}`)

    const own = await fetchExamSittingCandidacies(attacker, attackerId)
    expect(own.error).toBeNull()
    const ownIds = own.data.map((r) => r.sitting_id)
    expect(ownIds).toContain(liveSitting)
    expect(own.data.find((r) => r.sitting_id === liveSitting)).toMatchObject({
      sitting_scheduled_at: null,
      sitting_mode: null,
      sitting_status: null,
      deleted_at: null,
    })
    expect(ownIds).not.toContain(removedSitting)
    const ownEntries = await fetchExamSittingEntries(attacker, attackerId)
    expect(ownEntries.error).toBeNull()
    const ownEntryIds = ownEntries.data.map((r) => r.id)
    expect(ownEntryIds).toContain(ownEntry)
    expect(ownEntryIds).not.toContain(removedEntry)

    const peer = await fetchExamSittingCandidacies(attacker, victimId)
    expect(peer.error).toBeNull()
    expect(peer.data).toEqual([])
    const peerEntries = await fetchExamSittingEntries(attacker, victimId)
    expect(peerEntries.error).toBeNull()
    expect(peerEntries.data).toEqual([])

    const oracle = await attacker
      .from('exam_sitting_candidates')
      .select('id, exam_sittings!exam_sitting_candidates_sitting_id_organization_id_fkey!inner(id)')
      .eq('user_id', attackerId)
      .eq('exam_sittings.mode', 'remote')
    expect(oracle.error).toBeNull()
    expect(oracle.data).toEqual([])

    // CONTROL: the admin export path returns the removed row and resolves the sitting.
    const full = await fetchExamSittingCandidacies(admin, attackerId)
    expect(full.error).toBeNull()
    const bySitting = new Map(full.data.map((r) => [r.sitting_id, r]))
    expect(bySitting.get(liveSitting)).toMatchObject({
      sitting_mode: 'remote',
      sitting_status: 'scheduled',
      deleted_at: null,
    })
    expect(bySitting.get(liveSitting)?.sitting_scheduled_at).not.toBeNull()
    expect(bySitting.get(removedSitting)?.deleted_at).not.toBeNull()
    expect(bySitting.get(removedSitting)?.sitting_mode).toBe('remote')
    const fullEntries = await fetchExamSittingEntries(admin, attackerId)
    expect(fullEntries.error).toBeNull()
    const entryIds = fullEntries.data.map((r) => r.id)
    expect(entryIds).toContain(ownEntry)
    expect(entryIds).toContain(removedEntry)
    const fullPeer = await fetchExamSittingCandidacies(admin, victimId)
    expect(fullPeer.data.map((r) => r.sitting_id)).toContain(liveSitting)
  })
})
