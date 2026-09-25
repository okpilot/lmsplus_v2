/**
 * Red Team Spec: Authenticated Table-Level DML Denied on Revoked Cells (Vector FR)
 *
 * Attack: a signed-in student (real JWT, RLS-bound client) sends a direct
 * INSERT, UPDATE or DELETE against a (table, command) cell that mig
 * `20260925000300` revoked from `authenticated` — a cell with no production
 * write path and, for several of these tables, no permitting RLS policy
 * either. Before that migration the write reached RLS (and, on courses/
 * lessons/organizations/question_banks/audit_events/quiz_session_answers/
 * student_responses/user_consents, was denied there — see
 * `tenant-tables-direct-write.spec.ts` Vector FJ and `questions-direct-write
 * .spec.ts` Vector EX); after it, the write is refused at the privilege layer
 * BEFORE RLS is ever evaluated.
 *
 * Defense: the migration's REVOKE statements narrow `authenticated`'s table
 * grants to exactly the commands with a live policy and a production caller.
 * The rejection carries Postgres error 42501 ("permission denied for
 * table/view …") — the SAME code an RLS WITH CHECK violation raises on
 * INSERT, which is why the message (not just the code) is asserted: it is
 * what tells a privilege-layer denial apart from an RLS-layer one.
 *
 * REVOKED_CELLS below is a closed set, mirroring the migration's REVOKE
 * statements exactly (table -> commands). It is NOT derived from the
 * database — the migration is the source of truth being tested, so encoding
 * its cells as a second, independent read of the same file would test
 * nothing. Non-vacuity instead comes from confirming every named table
 * exists in the PostgREST OpenAPI root (service-role-derived, per Vector FQ).
 *
 * One KEPT cell is a positive control: flagged_questions keeps INSERT/UPDATE
 * for `authenticated` (its own student_all policy), so the student's own
 * upsert must succeed with no privilege error — proving the RLS-bound client
 * and the seeded question are both reachable, and that the loop below isn't
 * failing open because every write is broken for an unrelated reason.
 *
 * Status: Expected to PASS (defense should hold). A failing assertion means
 * an authenticated (non-admin) caller can still write to a revoked cell.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker, type FixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'
import { deriveTableSpecs, NIL_UUID, type TableSpec } from './helpers/table-specs'

type Command = 'insert' | 'update' | 'delete'

// Closed set — one row per REVOKE statement in
// supabase/migrations/20260925000300_least_privilege_table_grants.sql.
const REVOKED_CELLS: Array<{ table: string; commands: Command[] }> = [
  { table: 'audit_events', commands: ['insert', 'update', 'delete'] },
  { table: 'courses', commands: ['insert', 'update', 'delete'] },
  { table: 'lessons', commands: ['insert', 'update', 'delete'] },
  { table: 'organizations', commands: ['insert', 'update', 'delete'] },
  { table: 'question_banks', commands: ['insert', 'update', 'delete'] },
  { table: 'quiz_session_answers', commands: ['insert', 'update', 'delete'] },
  { table: 'student_responses', commands: ['insert', 'update', 'delete'] },
  { table: 'user_consents', commands: ['insert', 'update', 'delete'] },
  { table: 'active_flagged_questions', commands: ['insert', 'update', 'delete'] },
  { table: 'internal_exam_codes', commands: ['insert', 'delete'] },
  { table: 'users', commands: ['insert', 'delete'] },
  { table: 'exam_config_distributions', commands: ['update'] },
  { table: 'question_comments', commands: ['update'] },
  { table: 'exam_configs', commands: ['delete'] },
  { table: 'flagged_questions', commands: ['delete'] },
  { table: 'questions', commands: ['delete'] },
  { table: 'quiz_sessions', commands: ['delete'] },
]

test.describe('Red Team: Authenticated Table-Level DML Denied on Revoked Cells', () => {
  let student: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: ReturnType<typeof getAdminClient>
  let tableSpecs: Map<string, TableSpec>
  let studentId: string
  let questionId: string
  const tracker: FixtureTracker = createFixtureTracker()

  test.beforeAll(async () => {
    adminClient = getAdminClient()
    const seed = await seedRedTeamUsers()
    studentId = seed.attackerUserId
    const picked = await pickSubjectWithQuestions(adminClient, { orgId: seed.orgId })

    const { data: question, error: questionError } = await adminClient
      .from('questions')
      .select('id')
      .eq('topic_id', picked.topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (questionError || !question) {
      throw new Error(`beforeAll: could not resolve a question: ${questionError?.message}`)
    }
    questionId = question.id as string

    const specs = await deriveTableSpecs()
    tableSpecs = new Map(specs.map((s) => [s.name, s]))

    // Non-vacuity (code-style.md §7): the closed set is only a meaningful
    // probe if every named table genuinely exists in the live schema.
    for (const { table } of REVOKED_CELLS) {
      expect(tableSpecs.has(table), `"${table}" must exist in the OpenAPI root`).toBe(true)
    }

    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
  })

  test.afterAll(async () => {
    await cleanupFixtures(adminClient, tracker)
  })

  // ------------------------------------------------------------- controls

  test('a signed-in student can still upsert their own flagged_questions row (kept cell)', async () => {
    const { error } = await student
      .from('flagged_questions')
      .upsert(
        { student_id: studentId, question_id: questionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    tracker.flags.add(`${studentId}::${questionId}`)
    expect(error?.code).not.toBe('42501')
    expect(error).toBeNull()
  })

  // ---------------------------------------------------------- revoked cells

  for (const { table, commands } of REVOKED_CELLS) {
    for (const command of commands) {
      test(`a signed-in student cannot ${command} on "${table}" (revoked cell)`, async () => {
        const filterCol = tableSpecs.get(table)?.filterCol ?? 'id'
        const { error } = await runCommand(student, table, command, filterCol)
        expect(error?.code, `${command} on "${table}" must be rejected`).toBe('42501')
        expect(error?.message ?? '', `${command} on "${table}" error message`).toMatch(
          /permission denied for (table|view)/i,
        )
      })
    }
  }
})

/** Dispatch one probe command against `table` using an RLS-bound client. */
async function runCommand(
  client: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  table: string,
  command: Command,
  filterCol: string,
): Promise<{ error: { code?: string; message: string } | null }> {
  if (command === 'insert') {
    const { error } = await client.from(table).insert({})
    return { error }
  }
  if (command === 'update') {
    const { error } = await client
      .from(table)
      .update({ [filterCol]: NIL_UUID })
      .eq(filterCol, NIL_UUID)
    return { error }
  }
  const { error } = await client.from(table).delete().eq(filterCol, NIL_UUID)
  return { error }
}
