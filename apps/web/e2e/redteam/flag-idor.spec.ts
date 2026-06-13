/**
 * Red Team Spec: Flag IDOR / Cross-Student Isolation
 *
 * Vector S (MEDIUM): An authenticated attacker attempts to read or corrupt another
 * student's flagged_questions rows. flagged_questions RLS scopes every policy to
 * student_id = auth.uid(); every server entry point that touches flagged_questions
 * (the in-quiz flag actions and the report-page read helper getFlaggedQuestionIds)
 * hard-codes student_id from the auth token, so the attack is only expressible at the
 * direct-table layer — which
 * this spec exercises. Defenses must hold: attacker sees 0 of the victim's flags and
 * cannot insert a flag as the victim.
 *
 * Status: Expected to PASS (RLS should hold). A failure indicates an RLS gap.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Flag IDOR / Cross-Student Isolation', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: ReturnType<typeof getAdminClient>
  let victimUserId: string
  // Initialised so the afterAll guard can short-circuit if beforeAll throws before
  // this is assigned (a malformed `.in('student_id', […, ''])` would otherwise fire).
  let attackerUserId = ''
  let seededQuestionId: string | null = null

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    adminClient = getAdminClient()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Pick a deterministic active question in the seeded org (avoid non-deterministic .limit(1)).
    const { data: q, error: qErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('organization_id', seed.orgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .single()
    if (qErr || !q)
      throw new Error(
        `flag-idor seed: no active question in org ${seed.orgId}: ${qErr?.message ?? 'none'}`,
      )
    seededQuestionId = q.id

    // Seed a victim-owned flag using the admin (service-role) client so the isolation
    // test proves RLS blocks access to EXISTING data (not mere absence).
    const { error: insErr } = await adminClient
      .from('flagged_questions')
      .upsert(
        { student_id: victimUserId, question_id: seededQuestionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (insErr) throw new Error(`flag-idor seed: failed to seed victim flag: ${insErr.message}`)

    // Seed an ATTACKER-owned flag on the same question (composite PK (student_id,
    // question_id) makes (attacker, q) distinct from (victim, q)). This makes the
    // cross-student read assertions below non-vacuous (code-style.md §7): the
    // attacker genuinely owns a flag, so seeing 0 of the victim's flags proves RLS
    // isolation rather than an empty/unreadable table. Re-upsert resets deleted_at
    // to null if a prior run soft-deleted it.
    const { error: attErr } = await adminClient
      .from('flagged_questions')
      .upsert(
        { student_id: attackerUserId, question_id: seededQuestionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (attErr) throw new Error(`flag-idor seed: failed to seed attacker flag: ${attErr.message}`)
  })

  test('attacker cannot read victim flags via active_flagged_questions view', async () => {
    // Non-vacuity (code-style.md §7): the attacker owns a seeded flag, so the view
    // returns it (the view applies WHERE deleted_at IS NULL itself). A non-empty own
    // result proves the attacker CAN read the view and it is not globally empty.
    const { data: own, error: ownErr } = await attackerClient
      .from('active_flagged_questions')
      .select('question_id')
      .eq('student_id', attackerUserId)
    expect(ownErr).toBeNull()
    expect((own ?? []).length).toBeGreaterThan(0)

    const { data, error } = await attackerClient
      .from('active_flagged_questions')
      .select('question_id')
      .eq('student_id', victimUserId)
    expect(error).toBeNull() // RLS returns empty, not an error
    expect(data?.length ?? 0).toBe(0)
  })

  test('attacker cannot read victim flags via flagged_questions base table', async () => {
    // Non-vacuity (code-style.md §7): the base-table SELECT policy (mig
    // 20260323000050) is ownership-only — USING (student_id = auth.uid()), with NO
    // deleted_at filter (that lives in the view) — so we add `.is('deleted_at', null)`
    // here to assert the FRESHLY-seeded attacker row is visible, not a stale
    // soft-deleted one. A non-empty own result proves the attacker can read the table.
    const { data: own, error: ownErr } = await attackerClient
      .from('flagged_questions')
      .select('question_id')
      .eq('student_id', attackerUserId)
      .is('deleted_at', null)
    expect(ownErr).toBeNull()
    expect((own ?? []).length).toBeGreaterThan(0)

    const { data, error } = await attackerClient
      .from('flagged_questions')
      .select('student_id, question_id')
      .eq('student_id', victimUserId)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('attacker cannot insert a flag as the victim', async () => {
    // RLS WITH CHECK (student_id = auth.uid()) must reject a flag owned by another student.
    const { error } = await attackerClient
      .from('flagged_questions')
      .insert({ student_id: victimUserId, question_id: seededQuestionId, deleted_at: null })
    // RLS WITH CHECK (student_id = auth.uid()) rejects the cross-student insert with code 42501.
    expect(error?.code).toBe('42501')
  })

  test.afterAll(async () => {
    // Hermetic cleanup (code-style.md §7): soft-delete BOTH seeded flags (victim and
    // attacker) on the seeded question. flagged_questions has a composite PK
    // (student_id, question_id) and NO `id` column — filter + select on those columns.
    if (!seededQuestionId || !attackerUserId) return
    const { data: discarded, error } = await adminClient
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .in('student_id', [victimUserId, attackerUserId])
      .eq('question_id', seededQuestionId)
      .is('deleted_at', null)
      .select('student_id')
    if (error) {
      console.error(`[flag-idor cleanup] soft-delete error: ${error.message}`)
    } else if ((discarded?.length ?? 0) > 0) {
      console.log(`[flag-idor cleanup] soft-deleted ${discarded?.length} seeded flag(s)`)
    }
  })
})
