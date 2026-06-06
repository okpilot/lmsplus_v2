/**
 * Red Team Spec — Vector AJ (MEDIUM): direct reactivation of a soft-deleted exam_config.
 *
 * Attack: an admin issues a direct UPDATE exam_configs SET deleted_at = NULL to
 * reactivate a soft-deleted config outside the controlled upsert_exam_config path.
 * That bypasses the partial-unique-index de-dup guard (uq_exam_configs_org_subject_active,
 * mig 044) and could make a second "active" config visible to start_internal_exam_session.
 *
 * Defense (mig 089, DB layer): a BEFORE UPDATE trigger on exam_configs raises an
 * exception when deleted_at transitions from NOT NULL to NULL. The trigger is
 * unconditional — no role exemption — because there is no legitimate reactivation
 * path today. upsert_exam_config never clears deleted_at; it only UPDATEs active rows
 * (deleted_at IS NULL) or INSERTs fresh ones.
 *
 * The spec reaches the trigger via the admin-role PostgREST UPDATE path (the same
 * surface an attacker would use). upsert_exam_config is called via RPC — both the
 * blocked direct path and the allowed RPC path are exercised.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamAdmin,
} from './helpers/seed'

test.describe('Red Team: exam_config reactivation-guard trigger (Vector AJ)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let subjectId: string
  let topicId: string

  // Track configs created by this spec so afterEach can hard-delete them.
  // Hard-delete is safe here: exam_config_distributions rows are removed via
  // ON DELETE CASCADE (mig 038), and the trigger only blocks deleted_at → NULL
  // transitions (hard-deletes are DELETEs, not UPDATEs, so the trigger does not fire).
  const createdConfigIds = new Set<string>()

  // Snapshot of the seeded active config(s) (and their CASCADE-deleted child
  // distributions) this spec hard-deletes in beforeAll, so afterAll can restore them — the
  // trigger blocks un-soft-delete, so restoration is a re-INSERT of the full original rows
  // (code-style.md §7: restore mutated shared seed data).
  let restoreConfigs: Record<string, unknown>[] = []
  let restoreDistributions: Record<string, unknown>[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seededAdmin = await seedRedTeamAdmin()
    orgId = seededAdmin.orgId
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)

    // Pick a subject/topic with questions so upsert_exam_config (positive control)
    // can succeed without running into FK rejections on the distribution INSERT.
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId

    // Pre-clean: snapshot then hard-delete any active config for this subject so the
    // positive-control upsert_exam_config call starts from a clean slate (the partial
    // unique index uq_exam_configs_org_subject_active blocks two concurrent active rows
    // for the same org+subject). afterAll restores the snapshot so the shared seed config
    // is not destroyed for downstream specs (code-style.md §7).
    const { data: existing, error: existingErr } = await admin
      .from('exam_configs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
    if (existingErr) throw new Error(`beforeAll pre-clean lookup: ${existingErr.message}`)
    if (existing && existing.length > 0) {
      restoreConfigs = existing as Record<string, unknown>[]
      const ids = existing.map((r) => r.id as string)
      // Snapshot the child distributions too — they are CASCADE-deleted with the config
      // (mig 038) and a plain config re-insert would not bring them back.
      const { data: dists, error: distErr } = await admin
        .from('exam_config_distributions')
        .select('*')
        .in('exam_config_id', ids)
      if (distErr) throw new Error(`beforeAll pre-clean dist lookup: ${distErr.message}`)
      restoreDistributions = (dists ?? []) as Record<string, unknown>[]
      const { error: cleanErr } = await admin.from('exam_configs').delete().in('id', ids)
      if (cleanErr) throw new Error(`beforeAll pre-clean delete: ${cleanErr.message}`)
    }
  })

  test.afterAll(async () => {
    // Restore the seeded config(s) + distributions removed in beforeAll by re-inserting the
    // full original rows (same ids/timestamps). INSERT does not fire the BEFORE UPDATE OF
    // deleted_at trigger. Configs first (distributions FK them). Idempotent: clear after.
    if (restoreConfigs.length > 0) {
      const { error: cfgErr } = await admin.from('exam_configs').insert(restoreConfigs)
      if (cfgErr) throw new Error(`afterAll restore configs: ${cfgErr.message}`)
    }
    if (restoreDistributions.length > 0) {
      const { error: distErr } = await admin
        .from('exam_config_distributions')
        .insert(restoreDistributions)
      if (distErr) throw new Error(`afterAll restore distributions: ${distErr.message}`)
    }
    restoreConfigs = []
    restoreDistributions = []
  })

  test.afterEach(async () => {
    if (createdConfigIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('exam_configs')
        .delete()
        .in('id', Array.from(createdConfigIds))
        .select('id')
      if (error) throw new Error(`afterEach cleanup: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[reactivation-guard] hard-deleted ${data?.length} exam_config(s)`)
      }
    } finally {
      createdConfigIds.clear()
    }
  })

  test('AJ: direct UPDATE deleted_at → NULL is rejected by the trigger', async () => {
    // --- seed: create an active config then soft-delete it ---
    const { data: created, error: createErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 10,
        time_limit_seconds: 3600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (createErr || !created) throw new Error(`seed insert: ${createErr?.message}`)
    const configId = created.id
    createdConfigIds.add(configId)

    const { error: softDelErr } = await admin
      .from('exam_configs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', configId)
    expect(softDelErr).toBeNull()

    // --- non-vacuous: confirm deleted_at is set before attempting reactivation ---
    const { data: softDeletedRow, error: readErr } = await admin
      .from('exam_configs')
      .select('deleted_at')
      .eq('id', configId)
      .single()
    expect(readErr).toBeNull()
    expect(softDeletedRow?.deleted_at).not.toBeNull()

    // --- attack: direct UPDATE deleted_at = NULL via the admin-role PostgREST path ---
    const { data: reactivated, error: triggerErr } = await adminClient
      .from('exam_configs')
      .update({ deleted_at: null })
      .eq('id', configId)
      .select('id')

    // The trigger must reject the UPDATE.
    expect(triggerErr).not.toBeNull()
    expect(triggerErr?.message ?? '').toMatch(/reactivation/i)
    expect(reactivated).toBeNull()

    // --- post-attack: confirm the row is still soft-deleted (no partial commit) ---
    const { data: afterAttack, error: afterErr } = await admin
      .from('exam_configs')
      .select('deleted_at')
      .eq('id', configId)
      .single()
    expect(afterErr).toBeNull()
    expect(afterAttack?.deleted_at).not.toBeNull()
  })

  test('AJ positive control: upsert_exam_config succeeds (creates a fresh active row)', async () => {
    // Confirms the trigger does not break the legitimate code path. upsert_exam_config
    // only writes to active rows (deleted_at IS NULL) or INSERTs fresh ones — it never
    // transitions deleted_at from NOT NULL to NULL, so the trigger stays silent.
    const { data: configId, error: rpcErr } = await adminClient.rpc('upsert_exam_config', {
      p_subject_id: subjectId,
      p_enabled: true,
      p_total_questions: 10,
      p_time_limit_seconds: 3600,
      p_pass_mark: 75,
      p_distributions: [{ topic_id: topicId, subtopic_id: null, question_count: 10 }],
    })

    expect(rpcErr).toBeNull()
    expect(typeof configId).toBe('string')

    // Track for afterEach cleanup.
    if (typeof configId === 'string') createdConfigIds.add(configId)
  })
})
