/**
 * Red Team Spec: question comments first-page read (Vector IP, #1550)
 *
 * `fetchQuestionComments` (apps/web/app/app/quiz/actions/comment-queries.ts) now takes the
 * exact count from the same query that returns page 0 (COMMENT_SELECT with the
 * `users!user_id` embed). A student's read of that shape must exclude a soft-deleted
 * comment from both the rows and the count, and the count must equal the rows returned.
 * `question_comments` is a documented hard-delete table (mig 049): fixtures are hard-deleted.
 */

import { expect, test } from '@playwright/test'
import { COMMENT_SELECT } from '../../app/app/quiz/actions/comment-queries'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_COMMENT_COUNT_MARKER as MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: question comments first-page count (Vector IP)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let questionId: string
  const createdIds = new Set<string>()

  const readFirstPage = () =>
    attackerClient
      .from('question_comments')
      .select(COMMENT_SELECT, { count: 'exact' })
      .eq('question_id', questionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(0, 999)

  const seedComment = async (deleted: boolean) => {
    const { data, error } = await admin
      .from('question_comments')
      .insert({
        user_id: victimUserId,
        question_id: questionId,
        body: MARKER,
        deleted_at: deleted ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed comment: ${error?.message}`)
    createdIds.add(data.id)
    return data.id
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId: seed.orgId })
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', seed.orgId)
      .eq('subject_id', picked.subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
    if (error) throw new Error(`question lookup: ${error.message}`)
    questionId = data?.[0]?.id ?? ''
    if (!questionId) throw new Error('no active question available to seed a comment')
  })

  test.afterEach(async () => {
    try {
      if (createdIds.size === 0) return
      const { data, error } = await admin
        .from('question_comments')
        .delete()
        .in('id', Array.from(createdIds))
        .select('id')
      if (error) throw new Error(`afterEach: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.log(`[comment-count] removed ${data?.length} row(s)`)
    } finally {
      createdIds.clear()
    }
  })

  test('Vector IP: the first-page count equals the rows returned and excludes a soft-deleted comment', async () => {
    const before = await readFirstPage()
    expect(before.error).toBeNull()
    const baseline = before.count ?? -1
    expect(baseline).toBeGreaterThanOrEqual(0)

    const liveA = await seedComment(false)
    const liveB = await seedComment(false)
    const deletedId = await seedComment(true)

    // Non-vacuity: the soft-deleted comment exists.
    const { data: hidden, error: hiddenErr } = await admin
      .from('question_comments')
      .select('id, deleted_at')
      .eq('id', deletedId)
      .maybeSingle()
    expect(hiddenErr).toBeNull()
    expect(hidden?.deleted_at).not.toBeNull()

    const after = await readFirstPage()
    expect(after.error).toBeNull()
    const ids = (Array.isArray(after.data) ? after.data : []).map((r) => r.id)
    // Control arm: the two live inserts move the count by exactly 2, not 3.
    expect(after.count).toBe(baseline + 2)
    expect(ids).toHaveLength(after.count ?? -1)
    expect(ids).toEqual(expect.arrayContaining([liveA, liveB]))
    expect(ids).not.toContain(deletedId)
  })
})
