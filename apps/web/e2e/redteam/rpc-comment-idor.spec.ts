/**
 * Red Team Spec: deleteComment cross-user IDOR (Vector P)
 *
 * `question_comments_delete_own` RLS is `USING (user_id = auth.uid())` and the
 * deleteComment Server Action has NO redundant `.eq('user_id', ...)` guard — RLS
 * is the sole gate. This spec exercises a cross-user delete at the RLS/PostgREST
 * layer so a future RLS regression that opened cross-user deletes is caught.
 *
 * KEY semantics: a DELETE whose row fails the RLS USING clause is filtered out
 * SILENTLY — it is a 0-row no-op returning 200 OK / no error (code-style.md §5),
 * NOT a 42501. (42501 is the INSERT/UPDATE WITH CHECK behavior — see flag-idor.)
 * The security property asserted here is that the victim's comment SURVIVES.
 *
 * `question_comments` is a documented hard-delete table (mig 049), so fixtures
 * are torn down with a hard DELETE, not a soft-delete.
 *
 * Supersedes #313 (same vector, framed at the Server-Action layer; red-team
 * specs call PostgREST directly and cannot invoke Server Actions).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_COMMENT_IDOR_MARKER as COMMENT_MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

test.describe('Red Team: deleteComment cross-user IDOR (Vector P)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let questionId: string

  const createdCommentIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    const picked = await pickSubjectWithQuestions(admin, { orgId })
    const { data: questions, error: qErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', picked.subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
    if (qErr) throw new Error(`question lookup: ${qErr.message}`)
    questionId = questions?.[0]?.id ?? ''
    if (!questionId) throw new Error('no active question available to seed a comment')
  })

  const seedVictimComment = async (): Promise<string> => {
    const { data, error } = await admin
      .from('question_comments')
      .insert({ user_id: victimUserId, question_id: questionId, body: COMMENT_MARKER })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed comment: ${error?.message}`)
    createdCommentIds.add(data.id)
    return data.id
  }

  test.afterAll(async () => {
    if (createdCommentIds.size === 0) return
    // question_comments is a documented hard-delete table (mig 049) — tear down
    // with a hard DELETE, not a soft-delete.
    const { data, error } = await admin
      .from('question_comments')
      .delete()
      .in('id', Array.from(createdCommentIds))
      .select('id')
    if (error) throw new Error(`afterAll cleanup: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[comment-idor] hard-deleted ${data?.length} comment(s)`)
    }
    createdCommentIds.clear()
  })

  test("Vector P: a different student cannot delete the victim's comment (IDOR)", async () => {
    const commentId = await seedVictimComment()

    const { data: deleted, error } = await attackerClient
      .from('question_comments')
      .delete()
      .eq('id', commentId)
      .select('id')

    // RLS USING(user_id = auth.uid()) filters the foreign row out: the attacker's
    // delete is a 0-row no-op (200 OK, no error), NOT a 42501.
    expect(error).toBeNull()
    expect(deleted ?? []).toHaveLength(0)

    // The victim's comment must survive the attempt.
    const { data: survivor, error: checkErr } = await admin
      .from('question_comments')
      .select('id')
      .eq('id', commentId)
      .maybeSingle()
    expect(checkErr).toBeNull()
    expect(survivor?.id).toBe(commentId)
  })

  test('positive: the owner can delete their own comment', async () => {
    // Proves the DELETE policy is not vacuously rejecting everyone — the owner
    // can still remove their own comment.
    const commentId = await seedVictimComment()

    const { data: deleted, error } = await victimClient
      .from('question_comments')
      .delete()
      .eq('id', commentId)
      .select('id')

    expect(error).toBeNull()
    expect(deleted ?? []).toHaveLength(1)
    expect(deleted?.[0]?.id).toBe(commentId)

    const { data: gone, error: checkErr } = await admin
      .from('question_comments')
      .select('id')
      .eq('id', commentId)
      .maybeSingle()
    expect(checkErr).toBeNull()
    expect(gone).toBeNull()

    // Already hard-deleted by the owner — drop it from the cleanup set.
    createdCommentIds.delete(commentId)
  })

  test('no UPDATE policy: a comment cannot be edited, even by its owner', async () => {
    // question_comments has SELECT/INSERT/DELETE policies but NO UPDATE policy
    // (mig 049). Under RLS default-deny, an UPDATE matches zero rows and is a
    // silent 0-row no-op (not 42501). Pinning this invariant means a future
    // migration that adds a permissive UPDATE policy would fail this test.
    const commentId = await seedVictimComment()

    const { data: updated, error: updErr } = await victimClient
      .from('question_comments')
      .update({ body: 'edited by owner' })
      .eq('id', commentId)
      .select('id')
    expect(updErr).toBeNull()
    expect(updated ?? []).toHaveLength(0)

    const { data: row, error: checkErr } = await admin
      .from('question_comments')
      .select('body')
      .eq('id', commentId)
      .single()
    expect(checkErr).toBeNull()
    expect(row?.body).toBe(COMMENT_MARKER)
  })
})
