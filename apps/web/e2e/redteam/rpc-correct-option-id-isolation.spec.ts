/**
 * Red Team Spec: questions.correct_option_id column isolation (#823, Vector EA)
 *
 * #823 (P0) relocated the multiple-choice answer key out of the readable
 * `options` JSONB into a dedicated column, `questions.correct_option_id`, that
 * is REVOKE-gated from the `authenticated` role (mig 109 / 20260612000100). The
 * only SELECT-governing RLS policy on questions (tenant_isolation) is org-scoped,
 * NOT role-scoped — so a same-org student passes the RLS gate. The same-org
 * student is therefore the exploit surface: cross-org is already blocked by
 * tenant_isolation; the new risk is a student in the SAME org dumping the key
 * with `.select('correct_option_id')`. The column-level REVOKE is what closes it,
 * raising 42501 (permission denied) on a direct SELECT.
 *
 * Defense class mirrors BL/BM/BN (quiz_sessions score columns,
 * quiz-session-score-forgery.spec.ts) and mig 094's VFR RT answer-key columns.
 *
 * Non-vacuity (code-style.md §7): the positive control reads the protected value
 * via the service-role client FIRST, proving the column exists and is populated.
 * A later 42501 on the student client then proves the REVOKE fired — not that the
 * table was empty.
 *
 * Status: Expected to PASS (defenses should hold). All reads — no mutations, so
 * the afterEach is a no-op and the spec is hermetic by construction (it queries
 * existing seeded questions and creates no rows).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamStudent, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed'

const VALID_OPTION_IDS = ['a', 'b', 'c', 'd']

test.describe('Red Team: questions.correct_option_id column isolation (Vector EA)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  // A real egmont MC question whose answer key is populated — resolved in
  // beforeAll via the service-role client so both the positive control and the
  // negative attack target the SAME existing row.
  let mcQuestionId: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    // VICTIM is a persistent student in the egmont-aviation org — the same-org
    // exploit surface this vector targets.
    const seed = await seedRedTeamStudent()
    orgId = seed.orgId
    studentClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    // Resolve an active, non-deleted egmont multiple_choice question that has a
    // populated answer key. mig 109's backfill RAISEs if any MC question lacks a
    // key, so every active MC egmont question has a non-null correct_option_id.
    const { data: question, error } = await admin
      .from('questions')
      .select('id, correct_option_id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`beforeAll: question lookup failed: ${error.message}`)
    if (!question) {
      throw new Error(
        'beforeAll: no active egmont multiple_choice question with a correct_option_id found',
      )
    }
    mcQuestionId = question.id
  })

  test.afterEach(async () => {
    // No-op: this spec only reads. Present to match the redteam describe-level
    // hermiticity convention (code-style.md §7) and to flag immediately if a
    // future mutation is added without a restore.
  })

  test('positive control: service-role reads a populated correct_option_id letter for an egmont MC question', async () => {
    // Proves the column exists and is populated BEFORE asserting the student is
    // blocked — so the later 42501 means the REVOKE fired, not an empty table.
    const { data, error } = await admin
      .from('questions')
      .select('correct_option_id')
      .eq('id', mcQuestionId)
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const key = data?.correct_option_id
    expect(typeof key).toBe('string')
    expect(VALID_OPTION_IDS).toContain(key)
  })

  test('a same-org student is denied a direct SELECT of correct_option_id (42501)', async () => {
    // The attack: a student in the SAME org as the question reads the answer key
    // directly. tenant_isolation RLS passes (same org), but the column-level
    // REVOKE blocks the read with 42501 (permission denied).
    const { data, error } = await studentClient
      .from('questions')
      .select('correct_option_id')
      .eq('id', mcQuestionId)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  test('the same student can still read options, and no option carries a correct key (trigger strip)', async () => {
    // Defense-in-depth regression: the readable `options` column is unchanged for
    // students, and mig 109's sanitize trigger guarantees the `correct` boolean
    // never re-enters the JSONB — so the key cannot leak via the still-readable
    // options array either.
    const { data, error } = await studentClient
      .from('questions')
      .select('id, options')
      .eq('id', mcQuestionId)
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()

    const options = data?.options
    expect(Array.isArray(options)).toBe(true)
    const optionList = (Array.isArray(options) ? options : []) as Record<string, unknown>[]
    // Non-vacuity: an MC question has options to inspect.
    expect(optionList.length).toBeGreaterThan(0)
    for (const opt of optionList) {
      expect('correct' in opt).toBe(false)
    }
  })
})
