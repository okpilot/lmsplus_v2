/**
 * Red Team Spec: get_admin_dashboard_kpis + get_admin_weak_topics cross-org isolation (Vector KY)
 *
 * Both SECURITY DEFINER RPCs (migs 20260406000001 / 20260406000002) bypass RLS and scope every
 * aggregate by the caller's `users.organization_id`. A cross-org admin passes is_admin(), so the
 * org predicate is the only tenant boundary.
 *
 * Attack: the cross-org admin calls both RPCs.
 *  - totalStudents and sessionsThisPeriod equal the service-role per-org counts (live students;
 *    ended, non-deleted sessions), not egmont's. The mastery/exam-ready/weakest CTEs share the
 *    same `v_org_id`. avgMastery, examReadyStudents and weakestSubject are pinned (0, 0, null)
 *    under the empty-bank precondition (no active other-org question); only weakestSubject
 *    discriminates an unscoped question_counts (avg/examReady are 0 either way). A full per-org
 *    recompute needs a cross-org question bank.
 *  - every weak-topic row has a topic answered on an active, live question of ITS org, and its
 *    student_count equals the distinct students who answered it there. The equality applies when
 *    the other org has answered rows; otherwise the arm is the "no foreign topic" check.
 * An instructor (egmont, non-admin) is `forbidden` on both.
 *
 * CONTROL: the egmont admin's totalStudents equals egmont's count (which differs from the other
 * org's), and the egmont admin receives >= 1 weak-topic row whose topic is absent from the
 * cross-org expected set (the victim's seeded responses guarantee it).
 *
 * beforeAll inserts one ended egmont session (victim; no answers, no student_responses) and the
 * live other-org student; afterAll soft-deletes the session via cleanupFixtures.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId } from './helpers/seed-core'
import { E2E_REDTEAM_KY_MARKER } from './helpers/seed-markers'
import { seedVictimResponses } from './helpers/seed-responses'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Admin = ReturnType<typeof getAdminClient>

const KPIS = 'get_admin_dashboard_kpis'
const WEAK = 'get_admin_weak_topics'
const kpiArgs = { p_range_days: 0 }
const weakArgs = { p_limit: 100 }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

async function liveStudentCount(admin: Admin, orgId: string): Promise<number> {
  const { count, error } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('role', 'student')
    .is('deleted_at', null)
  if (error || count === null) throw new Error(`count students: ${error?.message ?? 'null'}`)
  return count
}

async function endedSessionCount(admin: Admin, orgId: string): Promise<number> {
  const { count, error } = await admin
    .from('quiz_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .not('ended_at', 'is', null)
    .is('deleted_at', null)
  if (error || count === null) throw new Error(`count sessions: ${error?.message ?? 'null'}`)
  return count
}

/** topic_id -> distinct answering students the RPC may return for `orgId` (mirrors its WHERE clause). */
async function answeredTopicStudents(
  admin: Admin,
  orgId: string,
): Promise<Map<string, Set<string>>> {
  const rows: unknown[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('student_responses')
      .select('student_id, questions!inner(topic_id, organization_id, status, deleted_at)')
      .eq('questions.organization_id', orgId)
      .eq('questions.status', 'active')
      .is('questions.deleted_at', null)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`answered topics: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) break
  }
  const map = new Map<string, Set<string>>()
  for (const row of rows) {
    const q = (row as { questions: unknown }).questions
    const one = Array.isArray(q) ? q[0] : q
    const studentId = (row as { student_id: unknown }).student_id
    if (!isRecord(one) || typeof one.topic_id !== 'string' || typeof studentId !== 'string') {
      continue
    }
    const set = map.get(one.topic_id) ?? new Set<string>()
    set.add(studentId)
    map.set(one.topic_id, set)
  }
  return map
}

const topicIds = (data: unknown): string[] =>
  ((data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.topic_id))

test.describe('Red Team: admin dashboard RPC cross-org isolation (KY)', () => {
  let admin: Admin
  let egmontOrgId: string
  let otherOrgId: string
  let egmontAdmin: Client
  let crossOrgAdmin: Client
  let instructor: Client
  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    await seedVictimResponses()
    await seedRedTeamAdmin()
    const cross = await seedCrossOrgAdmin()
    const inst = await seedRedTeamInstructor()
    egmontOrgId = await getEgmontOrgId(admin)
    otherOrgId = cross.orgId
    await createCrossOrgUser()
    const { data: session, error: sessionErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: egmontOrgId,
        student_id: users.victimUserId,
        mode: 'quick_quiz',
        total_questions: 0,
        config: { question_ids: [], e2e_marker: E2E_REDTEAM_KY_MARKER },
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (sessionErr || !isRecord(session) || typeof session.id !== 'string') {
      throw new Error(`seed ended session: ${sessionErr?.message ?? 'bad shape'}`)
    }
    tracker.sessions.add(session.id)
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossOrgAdmin = await createAuthenticatedClient(cross.email, cross.password)
    instructor = await createAuthenticatedClient(inst.email, inst.password)
  })

  test.afterAll(async () => {
    await cleanupFixtures(admin, tracker)
  })

  test('KY: KPI totals are scoped to the caller org', async () => {
    const egmontCount = await liveStudentCount(admin, egmontOrgId)
    const otherCount = await liveStudentCount(admin, otherOrgId)
    // Precondition: the two orgs differ, so a leaked count is observable.
    expect(egmontCount).not.toBe(otherCount)

    const own = await egmontAdmin.rpc(KPIS, kpiArgs)
    expect(own.error).toBeNull()
    expect(isRecord(own.data) && own.data.totalStudents).toBe(egmontCount)
    // An unscoped count would return egmont + other, which differs from `otherEnded`.
    const egmontEnded = await endedSessionCount(admin, egmontOrgId)
    const otherEnded = await endedSessionCount(admin, otherOrgId)
    expect(egmontEnded).toBeGreaterThanOrEqual(1)
    expect(isRecord(own.data) && own.data.sessionsThisPeriod).toBe(egmontEnded)

    const foreign = await crossOrgAdmin.rpc(KPIS, kpiArgs)
    expect(foreign.error).toBeNull()
    expect(isRecord(foreign.data) && foreign.data.totalStudents).toBe(otherCount)
    expect(isRecord(foreign.data) && foreign.data.sessionsThisPeriod).toBe(otherEnded)

    // Empty-bank precondition: with no active other-org question, question_counts is empty.
    expect(
      otherCount,
      'other org needs a live student or the weakestSubject pin is vacuous',
    ).toBeGreaterThanOrEqual(1)
    const { count: activeQuestions, error: qErr } = await admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', otherOrgId)
      .eq('status', 'active')
      .is('deleted_at', null)
    if (qErr || activeQuestions === null)
      throw new Error(`count questions: ${qErr?.message ?? 'null'}`)
    expect(
      activeQuestions,
      'an active other-org question left by an aborted run breaks this precondition — clean it up',
    ).toBe(0)
    expect(isRecord(foreign.data) && foreign.data.avgMastery).toBe(0)
    expect(isRecord(foreign.data) && foreign.data.examReadyStudents).toBe(0)
    expect(isRecord(foreign.data) && foreign.data.weakestSubject).toBeNull()
  })

  test('KY: weak topics carry only topics answered in the caller org', async () => {
    const otherExpected = await answeredTopicStudents(admin, otherOrgId)

    const own = await egmontAdmin.rpc(WEAK, weakArgs)
    expect(own.error).toBeNull()
    const ownIds = topicIds(own.data)
    // Control: egmont rows exist and at least one is foreign to the other org.
    expect(ownIds.length).toBeGreaterThanOrEqual(1)
    expect(ownIds.some((id) => !otherExpected.has(id))).toBe(true)

    const foreign = await crossOrgAdmin.rpc(WEAK, weakArgs)
    expect(foreign.error).toBeNull()
    const rows = (foreign.data ?? []) as Array<Record<string, unknown>>
    const leaked = rows.map((r) => String(r.topic_id)).filter((id) => !otherExpected.has(id))
    expect(leaked).toEqual([])
    for (const row of rows) {
      const students = otherExpected.get(String(row.topic_id))
      expect(students, String(row.topic_id)).toBeDefined()
      expect(Number(row.student_count), String(row.topic_id)).toBe(students?.size)
    }
  })

  test('KY: an instructor is forbidden on both RPCs', async () => {
    for (const [fn, args] of [
      [KPIS, kpiArgs],
      [WEAK, weakArgs],
    ] as const) {
      const { data, error } = await instructor.rpc(fn, args)
      expect(error?.message ?? '', fn).toMatch(/forbidden/i)
      expect(data, fn).toBeNull()
    }
  })
})
