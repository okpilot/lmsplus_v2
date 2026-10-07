/**
 * Red Team Spec: quiz_drafts DELETE policy scoped to the owner (mig 20261004000500, #1463) — Vector HQ
 *
 * HQ (idor): `quiz_drafts_student_all` (FOR ALL) is replaced by `quiz_drafts_student_delete`
 *     (FOR DELETE USING student_id = auth.uid()). An attacker in the victim's org deletes the
 *     victim's draft by id, and with an unfiltered DELETE.
 *     The victim's draft survives every attempt.
 *     CONTROL: the victim deleting the same draft by id removes exactly one row.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_DD_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

test.describe('Red Team: quiz_drafts cross-student DELETE (HQ)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victim: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  })

  // quiz_drafts is hard-delete by design (docs/database.md §3).
  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_drafts')
      .delete()
      .eq('session_config->>subjectName', E2E_REDTEAM_DD_MARKER)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[draft-delete] deleted ${data?.length} draft(s)`)
  })

  const seedDraft = async (studentId: string): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_drafts')
      .insert({
        student_id: studentId,
        organization_id: orgId,
        session_config: { subjectName: E2E_REDTEAM_DD_MARKER },
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') throw new Error(`seed draft: ${error?.message}`)
    return data.id
  }

  const draftExists = async (id: string): Promise<boolean> => {
    const { data, error } = await admin.from('quiz_drafts').select('id').eq('id', id)
    if (error) throw new Error(`read draft: ${error.message}`)
    return (data?.length ?? 0) === 1
  }

  test("a student cannot delete another student's draft", async () => {
    const victimDraft = await seedDraft(victimUserId)
    const attackerDraft = await seedDraft(attackerUserId)
    expect(await draftExists(victimDraft)).toBe(true)

    const byId = await attacker.from('quiz_drafts').delete().eq('id', victimDraft).select('id')
    expect(byId.error).toBeNull()
    expect(byId.data ?? []).toHaveLength(0)
    expect(await draftExists(victimDraft)).toBe(true)

    // Unfiltered DELETE reaches the attacker's own draft only.
    const unfiltered = await attacker
      .from('quiz_drafts')
      .delete()
      .eq('session_config->>subjectName', E2E_REDTEAM_DD_MARKER)
      .select('id')
    expect(unfiltered.error).toBeNull()
    expect((unfiltered.data ?? []).map((r) => r.id)).toEqual([attackerDraft])
    expect(await draftExists(victimDraft)).toBe(true)

    // CONTROL: the owner's delete removes the row.
    const own = await victim.from('quiz_drafts').delete().eq('id', victimDraft).select('id')
    expect(own.error).toBeNull()
    expect((own.data ?? []).map((r) => r.id)).toEqual([victimDraft])
    expect(await draftExists(victimDraft)).toBe(false)
  })
})
