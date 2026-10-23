/**
 * Red Team Spec: Discovery filter-set counts preloaded into /app/quiz (lib/queries/discovery-counts.ts)
 * — Vector IY
 *
 * IY (cross-tenant): the setup preload reads get_discovery_counts (#1602) for every subject and
 *     ships the 'flagged' and 'incorrect+flagged' sets to the caller's page; the client fallback
 *     calls get_filtered_question_counts. Neither of the attacker's counts may include a question
 *     only the victim flagged.
 *     CONTROL: the attacker flagging the same question raises the attacker's count by one, and the
 *     victim's count includes the victim's flag.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

test.describe('Red Team: preloaded Discovery flagged counts (IY)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let victimUserId: string
  let attackerUserId: string
  let subjectId: string
  let questionId: string
  // flagged_questions has no free-text column for a marker; every (student, question) pair this
  // spec flags is tracked here and soft-deleted in afterEach.
  const created = new Set<string>()

  /** The whole-subject 'flagged' count of the RPC behind the preload. */
  const flaggedCount = async (client: Client): Promise<number> => {
    const { data, error } = await client.rpc('get_filtered_question_counts', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: ['flagged'],
      p_calc_mode: 'all',
      p_has_image: 'all',
      p_question_type: 'multiple_choice',
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    let total = 0
    for (const r of data as unknown[]) {
      const n = Number((r as { n?: unknown }).n)
      expect(Number.isFinite(n)).toBe(true)
      total += n
    }
    return total
  }

  /** The subject's n_flagged and n_incorrect_or_flagged sums from the preload RPC. */
  const discoveryFlagged = async (client: Client): Promise<[number, number]> => {
    const { data, error } = await client.rpc('get_discovery_counts')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    let flagged = 0
    let either = 0
    for (const r of data as Record<string, unknown>[]) {
      if (r.subject_id !== subjectId) continue
      const f = Number(r.n_flagged)
      const e = Number(r.n_incorrect_or_flagged)
      expect(Number.isFinite(f) && Number.isFinite(e)).toBe(true)
      flagged += f
      either += e
    }
    return [flagged, either]
  }

  const flag = async (studentId: string) => {
    const { error } = await admin
      .from('flagged_questions')
      .upsert(
        { student_id: studentId, question_id: questionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (error) throw new Error(`flag: ${error.message}`)
    created.add(studentId)
  }

  const hasActiveFlag = async (studentId: string): Promise<boolean> => {
    const { data, error } = await admin
      .from('flagged_questions')
      .select('question_id')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
      .is('deleted_at', null)
    if (error) throw new Error(`hasActiveFlag: ${error.message}`)
    return (data?.length ?? 0) > 0
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id, subject_id')
      .eq('organization_id', seed.orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: false })
      .limit(50)
    if (error) throw new Error(`questions: ${error.message}`)
    for (const q of data ?? []) {
      // A question neither student has flagged, so the counts below move only by this spec's flags.
      questionId = q.id
      if ((await hasActiveFlag(victimUserId)) || (await hasActiveFlag(attackerUserId))) continue
      subjectId = q.subject_id
      return
    }
    throw new Error('no MC question unflagged by both students')
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const studentId of created) {
      try {
        const { data, error } = await admin
          .from('flagged_questions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', studentId)
          .eq('question_id', questionId)
          .is('deleted_at', null)
          .select('question_id')
        if (error) throw new Error(`unflag: ${error.message}`)
        if ((data?.length ?? 0) > 0) console.info(`[preload-counts] unflagged ${data?.length}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        created.delete(studentId)
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test("IY: the attacker's flagged count excludes a question only the victim flagged", async () => {
    const attackerBefore = await flaggedCount(attacker)
    const victimBefore = await flaggedCount(victim)
    const [aFlagged, aEither] = await discoveryFlagged(attacker)
    const [vFlagged, vEither] = await discoveryFlagged(victim)

    await flag(victimUserId)
    expect(await hasActiveFlag(victimUserId)).toBe(true)
    expect(await flaggedCount(victim)).toBe(victimBefore + 1)
    expect(await flaggedCount(attacker)).toBe(attackerBefore)
    const [vFlaggedAfter, vEitherAfter] = await discoveryFlagged(victim)
    expect(vFlaggedAfter).toBe(vFlagged + 1)
    expect(vEitherAfter).toBeGreaterThanOrEqual(vEither)
    expect(await discoveryFlagged(attacker)).toEqual([aFlagged, aEither])

    // CONTROL: the attacker's own flag on the same question is counted.
    await flag(attackerUserId)
    expect(await flaggedCount(attacker)).toBe(attackerBefore + 1)
    const [aFlaggedAfter, aEitherAfter] = await discoveryFlagged(attacker)
    expect(aFlaggedAfter).toBe(aFlagged + 1)
    expect(aEitherAfter).toBeGreaterThanOrEqual(aEither)
  })
})
