/**
 * Red Team Spec: get_discovery_counts (#1602, mig 20261023000100) — Vectors JQ, JR, JS, JT.
 *
 *   JQ  anon call — rejected at the privilege layer. Control: the egmont student gets rows.
 *   JR  cross-org — an org-B caller sees exactly the org-B pool (the org-B fixture shares the
 *       egmont subject/topic); the egmont caller's counts exclude it. Both checked against a
 *       service-role recomputation of each caller's pool.
 *   JS  draft / soft-deleted / non-MC — never counted. Control: the to-delete fixture is counted
 *       before its soft-delete and drops out after.
 *   JT  student_responses over-scope — an instructor (RLS lets them read the victim's responses)
 *       gets n_unseen == n_all everywhere. Control: the instructor reads a victim response
 *       directly, and the victim's own n_unseen is below n_all.
 *
 * Hermetic (code-style.md §7): questions are setupEoFixtures rows (E2E_REDTEAM_EO_MARKER),
 * soft-deleted in afterAll. Victim responses are the append-only seedVictimResponses rows.
 */

import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedVictimResponses } from './helpers/seed-responses'
import { seedRedTeamInstructor } from './helpers/seed-users'
import { cleanupEoFixtures, type EoFixtures, setupEoFixtures } from './helpers/start-quiz-fixtures'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const COLUMNS = ['n_all', 'n_unseen', 'n_incorrect', 'n_flagged', 'n_incorrect_or_flagged'] as const
type Counts = Record<(typeof COLUMNS)[number], number>
type CountMap = Record<string, Counts>

const groupKey = (s: unknown, t: unknown, st: unknown) => `${s}|${t}|${st ?? ''}`

/** The caller's get_discovery_counts rows, keyed by (subject, topic, subtopic), counts coerced. */
async function rpcCounts(client: SupabaseClient): Promise<CountMap> {
  const { data, error } = await client.rpc('get_discovery_counts')
  expect(error).toBeNull()
  expect(Array.isArray(data)).toBe(true)
  const rows = data as Record<string, unknown>[]
  expect(rows.length).toBeLessThan(1000)
  const out: CountMap = {}
  for (const r of rows) {
    const key = groupKey(r.subject_id, r.topic_id, r.subtopic_id)
    expect(out[key]).toBeUndefined()
    const counts = {} as Counts
    for (const c of COLUMNS) {
      const n = Number(r[c])
      expect(Number.isInteger(n)).toBe(true)
      counts[c] = n
    }
    out[key] = counts
  }
  return out
}

async function idSet(
  query: PromiseLike<{ data: { question_id: string }[] | null; error: { message: string } | null }>,
  label: string,
): Promise<Set<string>> {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return new Set((data ?? []).map((r) => r.question_id))
}

/** Service-role recomputation of the pool and per-student predicates for one caller. */
async function expectedCounts(
  admin: EoFixtures['admin'],
  opts: { orgId: string; studentId: string },
): Promise<CountMap> {
  const { data: qs, error } = await admin
    .from('questions')
    .select('id, subject_id, topic_id, subtopic_id')
    .eq('organization_id', opts.orgId)
    .eq('status', 'active')
    .eq('question_type', 'multiple_choice')
    .is('deleted_at', null)
  if (error) throw new Error(`questions: ${error.message}`)
  const answered = await idSet(
    admin.from('student_responses').select('question_id').eq('student_id', opts.studentId),
    'responses',
  )
  const incorrect = await idSet(
    admin
      .from('fsrs_cards')
      .select('question_id')
      .eq('student_id', opts.studentId)
      .eq('last_was_correct', false),
    'fsrs_cards',
  )
  const flagged = await idSet(
    admin
      .from('flagged_questions')
      .select('question_id')
      .eq('student_id', opts.studentId)
      .is('deleted_at', null),
    'flags',
  )
  const out: CountMap = {}
  for (const q of qs ?? []) {
    const key = groupKey(q.subject_id, q.topic_id, q.subtopic_id)
    out[key] ??= { n_all: 0, n_unseen: 0, n_incorrect: 0, n_flagged: 0, n_incorrect_or_flagged: 0 }
    const c = out[key]
    c.n_all += 1
    if (!answered.has(q.id)) c.n_unseen += 1
    if (incorrect.has(q.id)) c.n_incorrect += 1
    if (flagged.has(q.id)) c.n_flagged += 1
    if (incorrect.has(q.id) || flagged.has(q.id)) c.n_incorrect_or_flagged += 1
  }
  return out
}

test.describe('Red Team: get_discovery_counts (#1602)', () => {
  let fx: EoFixtures
  let crossOrgUserId: string
  let fixtureKey: string

  test.beforeAll(async () => {
    fx = await setupEoFixtures()
    const { data: who, error: whoErr } = await fx.crossOrgClient.auth.getUser()
    if (whoErr || !who.user) throw new Error(`cross-org getUser: ${whoErr?.message}`)
    crossOrgUserId = who.user.id
    const { data: q, error } = await fx.admin
      .from('questions')
      .select('subject_id, topic_id, subtopic_id')
      .eq('id', fx.egMcActiveId)
      .single()
    if (error || !q) throw new Error(`fixture lookup: ${error?.message}`)
    fixtureKey = groupKey(q.subject_id, q.topic_id, q.subtopic_id)
  })

  test.afterAll(async () => {
    await cleanupEoFixtures(fx.admin, fx.createdQuestionIds)
  })

  test('JQ: an anonymous caller cannot execute get_discovery_counts', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc('get_discovery_counts')
    expect(error?.message ?? '').toMatch(/permission denied for function/i)
    expect(data).toBeNull()

    // CONTROL: the authenticated egmont student gets rows.
    expect(Object.keys(await rpcCounts(fx.studentClient)).length).toBeGreaterThan(0)
  })

  test('JR: each caller counts only its own org pool', async () => {
    const crossOrg = await rpcCounts(fx.crossOrgClient)
    expect(crossOrg).toEqual(
      await expectedCounts(fx.admin, { orgId: fx.otherOrgId, studentId: crossOrgUserId }),
    )
    // The org-B fixture shares the egmont subject/topic and is counted for org B only.
    expect(crossOrg[fixtureKey]?.n_all ?? 0).toBeGreaterThan(0)

    const egmont = await rpcCounts(fx.studentClient)
    const egmontExpected = await expectedCounts(fx.admin, {
      orgId: fx.orgId,
      studentId: fx.victimUserId,
    })
    expect(egmont).toEqual(egmontExpected)
    expect(egmont[fixtureKey]?.n_all ?? 0).toBeGreaterThan(0)
  })

  test('JS: draft, soft-deleted and non-MC questions are never counted', async () => {
    const { count: allInGroup, error: allErr } = await fx.admin
      .from('questions')
      .select('id', { head: true, count: 'exact' })
      .in('id', [fx.egMcActiveId, fx.egMcDeletedId, fx.egShortAnswerId, fx.egMcDraftId])
    if (allErr) throw new Error(`fixture count: ${allErr.message}`)
    expect(allInGroup).toBe(4)

    // CONTROL: the to-delete fixture is still active and counted.
    const before = await rpcCounts(fx.studentClient)
    expect(before).toEqual(
      await expectedCounts(fx.admin, { orgId: fx.orgId, studentId: fx.victimUserId }),
    )
    const beforeN = before[fixtureKey]?.n_all ?? 0
    expect(beforeN).toBeGreaterThanOrEqual(2)

    const { data: deleted, error } = await fx.admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', fx.egMcDeletedId)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`soft-delete: ${error.message}`)
    expect(deleted?.length).toBe(1)

    const after = await rpcCounts(fx.studentClient)
    expect(after[fixtureKey]?.n_all).toBe(beforeN - 1)
    expect(after).toEqual(
      await expectedCounts(fx.admin, { orgId: fx.orgId, studentId: fx.victimUserId }),
    )
  })

  test("JT: an instructor's unseen count ignores the students' responses RLS lets them read", async () => {
    const victimResponses = await seedVictimResponses()
    const instructor = await seedRedTeamInstructor()
    const instructorClient = await createAuthenticatedClient(instructor.email, instructor.password)

    // CONTROL: RLS (instructors_read_students) lets the instructor read the victim's responses.
    const { data: readable, error: readErr } = await instructorClient
      .from('student_responses')
      .select('question_id')
      .eq('student_id', victimResponses.victimUserId)
      .limit(1)
    expect(readErr).toBeNull()
    expect(readable?.length).toBe(1)

    // CONTROL: the victim's own unseen count is below n_all somewhere.
    const victim = await rpcCounts(fx.studentClient)
    expect(Object.values(victim).some((c) => c.n_unseen < c.n_all)).toBe(true)

    const rows = await rpcCounts(instructorClient)
    expect(rows).toEqual(
      await expectedCounts(fx.admin, {
        orgId: instructor.orgId,
        studentId: instructor.instructorUserId,
      }),
    )
    const values = Object.values(rows)
    expect(values.length).toBeGreaterThan(0)
    for (const c of values) expect(c.n_unseen).toBe(c.n_all)
  })
})
