/**
 * Red Team Spec: Quiz Draft Question Injection
 *
 * Vector C (MEDIUM): A student saves a quiz draft containing question_ids that
 * belong to a different org or subject — attempting to reference questions they
 * should not have access to, either to probe for data or to load them in future
 * quiz sessions.
 *
 * Two sub-scenarios:
 *   1. RLS blocks the INSERT entirely (ideal — draft is rejected).
 *   2. Draft is saved but the questions can't be loaded later (RLS filters at read).
 *
 * Status: Expected to PASS in the sense that the injected questions are never
 * accessible. If the INSERT is allowed, a follow-up SELECT must return 0 rows.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Red Team: Quiz Draft Question Injection', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let attackerUserId: string
  let foreignQuestionIds: string[]
  let knownSubjectId: string

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    adminClient = getAdminClient()

    const { data: me } = await attackerClient.auth.getUser()
    attackerUserId = me?.user?.id ?? ''
    expect(attackerUserId).not.toBe('')

    // Admin: resolve real question IDs and a subject the attacker can legitimately access
    const { data: subjects } = await adminClient.from('subjects').select('id').limit(2)

    expect(subjects?.length).toBeGreaterThanOrEqual(1)
    knownSubjectId = subjects![0].id

    // Pick questions from a second subject (foreign scope for injection attempt)
    const secondSubjectId = subjects![1]?.id ?? subjects![0].id

    const { data: topics } = await adminClient
      .from('topics')
      .select('id')
      .eq('subject_id', secondSubjectId)
      .limit(3)

    const topicIds = (topics ?? []).map((t) => t.id)

    const { data: questions } = await adminClient
      .from('questions')
      .select('id')
      .in('topic_id', topicIds.length > 0 ? topicIds : ['00000000-0000-0000-0000-000000000000'])
      .is('deleted_at', null)
      .limit(5)

    foreignQuestionIds = (questions ?? []).map((q) => q.id)

    // If we couldn't find foreign questions, use sentinel UUIDs — the INSERT should
    // still be tested (just won't find real data at read time either way).
    if (foreignQuestionIds.length === 0) {
      foreignQuestionIds = [
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000011',
      ]
    }
  })

  test('inserting a draft with foreign question_ids is rejected or returns no questions on load', async () => {
    // Attack: save a draft with question_ids from another subject
    const { data: insertData, error: insertError } = await attackerClient
      .from('quiz_drafts')
      .insert({
        student_id: attackerUserId,
        subject_id: knownSubjectId,
        question_ids: foreignQuestionIds,
        answered_so_far: [],
      })
      .select('id')

    if (insertError) {
      // Ideal outcome: RLS rejected the insert outright
      expect(insertError).not.toBeNull()
      return
    }

    // If insert succeeded, the draft must not expose the foreign questions at read time
    const draftId = (insertData as { id: string }[] | null)?.[0]?.id
    expect(draftId).toBeTruthy()

    // Attempt to read the questions referenced in the draft
    const { data: readableQuestions } = await attackerClient
      .from('questions')
      .select('id')
      .in('id', foreignQuestionIds)

    // RLS must return 0 accessible foreign questions
    expect(readableQuestions?.length ?? 0).toBe(0)

    // Cleanup: remove the injected draft so it doesn't pollute other tests
    await adminClient.from('quiz_drafts').delete().eq('id', draftId)
  })

  test('attacker cannot insert a draft owned by another student (student_id forgery)', async () => {
    // Attack: spoof student_id to save a draft under the victim's account
    const { data: victimData } = await victimClient.auth.getUser()
    const victimUserId = victimData?.user?.id ?? ''
    expect(victimUserId).not.toBe('')

    const { error } = await attackerClient.from('quiz_drafts').insert({
      student_id: victimUserId, // Forged: attacker pretends to be victim
      subject_id: knownSubjectId,
      question_ids: foreignQuestionIds,
      answered_so_far: [],
    })

    // RLS must reject: student_id in the row must match auth.uid()
    expect(error).not.toBeNull()
  })

  test("attacker cannot read another student's quiz drafts", async () => {
    // First, create a legitimate draft as the victim
    const { data: victimMe } = await victimClient.auth.getUser()
    const victimUserId = victimMe?.user?.id ?? ''

    await adminClient.from('quiz_drafts').insert({
      student_id: victimUserId,
      subject_id: knownSubjectId,
      question_ids: [],
      answered_so_far: [],
    })

    // Attacker attempts to read all drafts — must only see their own
    const { data: drafts, error } = await attackerClient
      .from('quiz_drafts')
      .select('id, student_id')
      .limit(20)

    expect(error).toBeNull()

    if (drafts && drafts.length > 0) {
      for (const draft of drafts) {
        expect(draft.student_id).toBe(attackerUserId)
      }
    }
  })

  test("attacker cannot update another student's quiz draft", async () => {
    // Find a draft belonging to the victim
    const { data: victimMe } = await victimClient.auth.getUser()
    const victimUserId = victimMe?.user?.id ?? ''

    const { data: victimDrafts } = await adminClient
      .from('quiz_drafts')
      .select('id')
      .eq('student_id', victimUserId)
      .limit(1)

    if (!victimDrafts || victimDrafts.length === 0) {
      // No victim draft to target — pass (nothing to exploit)
      return
    }

    const victimDraftId = victimDrafts[0].id

    const { error } = await attackerClient
      .from('quiz_drafts')
      .update({ question_ids: foreignQuestionIds })
      .eq('id', victimDraftId)

    // RLS must block cross-student UPDATE
    expect(error).not.toBeNull()
  })
})
