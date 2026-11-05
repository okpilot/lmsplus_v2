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
 *    same `v_org_id`, so only these two are asserted.
 *  - every weak-topic row has a topic answered on an active, live question of ITS org, and its
 *    student_count equals the distinct students who answered it there. The equality applies when
 *    the other org has answered rows; otherwise the arm is the "no foreign topic" check.
 * An instructor (egmont, non-admin) is `forbidden` on both.
 *
 * CONTROL: the egmont admin's totalStudents equals egmont's count (which differs from the other
 * org's), and the egmont admin receives >= 1 weak-topic row whose topic is absent from the
 * cross-org expected set (the victim's seeded responses guarantee it).
 *
 * beforeAll seeds one ended egmont session (victim); afterAll soft-deletes it via cleanupFixtures.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId } from './helpers/seed-core'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { seedVictimResponses } from './helpers/seed-responses'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'
import { seedVictimCompletedSession } from './helpers/seed-victim-session'

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
  const { data, error } = await admin
    .from('student_responses')
    .select('student_id, questions!inner(topic_id, organization_id, status, deleted_at)')
    .eq('questions.organization_id', orgId)
    .eq('questions.status', 'active')
    .is('questions.deleted_at', null)
  if (error) throw new Error(`answered topics: ${error.message}`)
  const map = new Map<string, Set<string>>()
  for (const row of data ?? []) {
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
    const picked = await pickSubjectWithQuestions(admin, { orgId: egmontOrgId })
    await clearOpenSessions(admin, users.victimUserId, 'kpis-cross-org')
    await seedVictimCompletedSession(
      admin,
      { orgId: egmontOrgId, subjectId: picked.subjectId, topicId: picked.topicId },
      tracker,
    )
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
