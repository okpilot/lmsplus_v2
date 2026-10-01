/**
 * One-call org fixture for the Part 3 VFR RT exam suites. Seeds a test org + admin + student, the
 * 8 short_answer and 9 dialog_fill questions Parts 1-2 need, an enabled exam_configs row, and a
 * FIXED Part 3 pool of exactly 2 questions in each seeded P3 subtopic — so the sampler has no slack
 * and the started exam is deterministic:
 *   P3_NUMBERS 2 MC | P3_EMERGENCY 1 MC + 1 ORD | P3_POSREP 2 ORD | P3_PATTERN 1 MC + 1 DIAG
 * Shared P3_MC rows are only READ. Not a test file — Vitest does not collect it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { createTestOrg, createTestUser, getAuthenticatedClient } from './setup'
import {
  admin,
  ensureBank,
  getRtRefs,
  insertDialogFillQuestion,
  insertMcQuestion,
  insertShortAnswerQuestion,
  suffix,
} from './vfr-rt-helpers'
import {
  type DiagramFixture,
  getP3Subtopics,
  insertDiagramQuestion,
  insertOrderingQuestion,
  type OrderingFixture,
} from './vfr-rt-part3-helpers'

export type Part3Org = {
  orgId: string
  adminId: string
  studentId: string
  studentEmail: string
  studentPassword: string
  userIds: string[]
  studentClient: SupabaseClient
  rtSubjectId: string
  p3TopicId: string
  subtopicIds: Awaited<ReturnType<typeof getP3Subtopics>>
  /** question id -> subtopic code, for the 8 Part 3 questions. */
  subtopicOf: Record<string, string>
  ordering: OrderingFixture[]
  diagram: DiagramFixture
  mcIds: string[]
  cleanup: () => Promise<void>
}

type StartResult = {
  session_id: string
  question_ids: string[]
  parts: { p1_end: number; p2_end: number; p3_end: number }
}

async function createPart3Users(tag: string) {
  const orgId = await createTestOrg({
    admin,
    name: `RT P3 ${tag} ${suffix}`,
    slug: `rt-p3-${tag}-${suffix}`,
  })
  const email = (role: string) => `${role}-rtp3${tag}-${suffix}@test.local`
  const password = 'test-pass-123'
  const adminId = await createTestUser({
    admin,
    orgId,
    email: email('admin'),
    password,
    role: 'admin',
  })
  const studentId = await createTestUser({
    admin,
    orgId,
    email: email('student'),
    password,
    role: 'student',
  })
  const studentClient = await getAuthenticatedClient({ email: email('student'), password })
  return {
    orgId,
    adminId,
    studentId,
    studentClient,
    studentEmail: email('student'),
    studentPassword: password,
  }
}

type RtRefs = Awaited<ReturnType<typeof getRtRefs>>
type PoolBase = { orgId: string; bankId: string; adminId: string; rtSubjectId: string }

async function seedParts12(base: PoolBase, refs: RtRefs) {
  for (let i = 0; i < 8; i++)
    await insertShortAnswerQuestion({ ...base, p1TopicId: refs.p1TopicId, idx: i })
  for (let i = 0; i < 9; i++)
    await insertDialogFillQuestion({ ...base, p2TopicId: refs.p2TopicId, idx: i })
}

async function seedPart3Pool(base: PoolBase, refs: RtRefs) {
  const subs = await getP3Subtopics(refs.p3TopicId)
  const p3 = { ...base, topicId: refs.p3TopicId }
  const mc = (code: keyof typeof subs, idx: number) =>
    insertMcQuestion({ ...base, p3TopicId: refs.p3TopicId, subtopicId: subs[code], idx })
  const mcNum = [await mc('P3_NUMBERS', 0), await mc('P3_NUMBERS', 1)]
  const mcEmg = await mc('P3_EMERGENCY', 2)
  const mcPat = await mc('P3_PATTERN', 3)
  const ordEmg = await insertOrderingQuestion({ ...p3, subtopicId: subs.P3_EMERGENCY, idx: 10 })
  const ordPos = [
    await insertOrderingQuestion({ ...p3, subtopicId: subs.P3_POSREP, idx: 11 }),
    await insertOrderingQuestion({ ...p3, subtopicId: subs.P3_POSREP, idx: 12 }),
  ]
  const diagram = await insertDiagramQuestion({ ...p3, subtopicId: subs.P3_PATTERN, idx: 20 })
  const subtopicOf: Record<string, string> = {}
  const tag = (code: string, ...ids: string[]) => {
    for (const id of ids) subtopicOf[id] = code
  }
  tag('P3_NUMBERS', ...mcNum)
  tag('P3_EMERGENCY', mcEmg, ordEmg.id)
  tag('P3_POSREP', ...ordPos.map((o) => o.id))
  tag('P3_PATTERN', mcPat, diagram.id)
  return {
    subtopicIds: subs,
    subtopicOf,
    ordering: [ordEmg, ...ordPos],
    diagram,
    mcIds: [...mcNum, mcEmg, mcPat],
  }
}

async function insertRtExamConfig(orgId: string, rtSubjectId: string) {
  const { error } = await admin.from('exam_configs').insert({
    organization_id: orgId,
    subject_id: rtSubjectId,
    enabled: true,
    total_questions: 25,
    time_limit_seconds: 1800,
    pass_mark: 75,
  })
  if (error) throw new Error(`exam_configs insert: ${error.message}`)
}

export async function createPart3Org(tag: string): Promise<Part3Org> {
  const refs = await getRtRefs()
  const { orgId, adminId, studentId, studentClient, studentEmail, studentPassword } =
    await createPart3Users(tag)
  const userIds = [adminId, studentId]
  const cleanup = () => cleanupTestData({ admin, orgId, userIds })
  try {
    const bankId = await ensureBank(orgId, adminId)
    const base = { orgId, bankId, adminId, rtSubjectId: refs.rtSubjectId }
    await seedParts12(base, refs)
    const pool = await seedPart3Pool(base, refs)
    await insertRtExamConfig(orgId, refs.rtSubjectId)
    return {
      orgId,
      adminId,
      studentId,
      studentEmail,
      studentPassword,
      userIds,
      studentClient,
      rtSubjectId: refs.rtSubjectId,
      p3TopicId: refs.p3TopicId,
      ...pool,
      cleanup,
    }
  } catch (e) {
    await cleanup()
    throw e
  }
}

/** Start an exam as the org's student and return the frozen session. */
export async function startPart3Exam(org: Part3Org): Promise<StartResult> {
  const { data, error } = await org.studentClient.rpc('start_vfr_rt_exam_session', {
    p_subject_id: org.rtSubjectId,
  })
  if (error) throw new Error(`start_vfr_rt_exam_session: ${error.message}`)
  return requireRpcResult<StartResult>(data, 'start_vfr_rt_exam_session')
}

/** Force-end an active session so the next start creates a fresh one. */
export async function forceEndSession(sessionId: string): Promise<void> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({
      ended_at: new Date().toISOString(),
      correct_count: 0,
      score_percentage: 0,
      passed: false,
    })
    .eq('id', sessionId)
    .select('id')
  if (error) throw new Error(`forceEndSession: ${error.message}`)
  if (!data?.length) throw new Error(`forceEndSession: no session ${sessionId}`)
}
