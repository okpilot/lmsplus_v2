import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult } from './guards'
import { seedTypedQuestions, type TypedQuestionIds } from './quiz-progress-questions'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const PASSWORD = 'test-pass-123'

export type ProgressFixture = TypedQuestionIds & {
  admin: SupabaseClient
  orgId: string
  studentId: string
  otherStudentId: string
  student: SupabaseClient
  other: SupabaseClient
  teardown: () => Promise<void>
}

type Refs = Awaited<ReturnType<typeof seedReferenceData>>

type SeededUser = { id: string; email: string }

/** Org + admin + two students; collects ids for teardown. */
async function seedProgressUsers(admin: SupabaseClient, tag: string, suffix: string) {
  const orgId = await createTestOrg({
    admin,
    name: `Test Org ${tag} ${suffix}`,
    slug: `test-${tag}-${suffix}`,
  })
  const userIds: string[] = []
  const mk = async (role: 'admin' | 'student', name: string): Promise<SeededUser> => {
    const email = `${name}-${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: PASSWORD, role })
    userIds.push(id)
    return { id, email }
  }
  const adminUser = await mk('admin', 'admin')
  const a = await mk('student', 'studenta')
  const b = await mk('student', 'studentb')
  return { orgId, userIds, adminUser, a, b }
}

/** Org + two students + one question of every type, for the quiz-progress suites. */
export async function setupProgressFixture(tag: string): Promise<ProgressFixture> {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const { orgId, userIds, adminUser, a, b } = await seedProgressUsers(admin, tag, suffix)
  const refs: Refs = await seedReferenceData({
    admin,
    subjectCode: `P${suffix}`,
    subjectName: `Progress Subject ${suffix}`,
    topicCode: `P${suffix}-01`,
    topicName: `Progress Topic ${suffix}`,
  })
  const questions = await seedTypedQuestions({ admin, orgId, adminId: adminUser.id, refs })
  return {
    admin,
    orgId,
    studentId: a.id,
    otherStudentId: b.id,
    student: await getAuthenticatedClient({ email: a.email, password: PASSWORD }),
    other: await getAuthenticatedClient({ email: b.email, password: PASSWORD }),
    ...questions,
    teardown: async () => {
      await cleanupTestData({ admin, orgId, userIds })
      await cleanupReferenceData({ admin, refs: [refs] })
    },
  }
}

type SessionMode = 'mock_exam' | 'internal_exam' | 'vfr_rt_exam' | 'discovery'

/** Insert a session through the service role (exam / discovery modes have no student start path). */
export async function insertSession(opts: {
  f: ProgressFixture
  mode: SessionMode
  questionIds: string[]
  timeLimitSeconds?: number
  startedAt?: string
}): Promise<string> {
  const { f, mode, questionIds } = opts
  const { data, error } = await f.admin
    .from('quiz_sessions')
    .insert({
      organization_id: f.orgId,
      student_id: f.studentId,
      mode,
      config: { question_ids: questionIds, pass_mark: 75 },
      total_questions: questionIds.length,
      time_limit_seconds: opts.timeLimitSeconds ?? null,
      started_at: opts.startedAt ?? new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertSession (${mode}): ${error.message}`)
  return requireRpcResult<{ id: string }>(data, 'insertSession').id
}

/** Start a practice session as student A through the real start RPC. */
export async function startPractice(
  f: ProgressFixture,
  mode: 'quick_quiz' | 'smart_review',
  questionIds: string[],
): Promise<string> {
  const { data, error } = await f.student.rpc('start_quiz_session', {
    p_mode: mode,
    p_subject_id: null,
    p_topic_id: null,
    p_question_ids: questionIds,
  })
  if (error) throw new Error(`startPractice: ${error.message}`)
  if (typeof data !== 'string') throw new Error('startPractice: no session id')
  return data
}

/** Service-role read of every progress row of a session (the protected state under test). */
export async function progressRows(f: ProgressFixture, sessionId: string) {
  const { data, error } = await f.admin
    .from('quiz_session_progress')
    .select('question_id, student_id, answer, time_spent_ms, answered_at')
    .eq('session_id', sessionId)
  if (error) throw new Error(`progressRows: ${error.message}`)
  if (!Array.isArray(data)) throw new Error('progressRows: unexpected response shape')
  return data.map(toProgressRow)
}

type ProgressRow = {
  question_id: string
  student_id: string
  answer: unknown
  time_spent_ms: number
  answered_at: string | null
}

function toProgressRow(row: unknown): ProgressRow {
  if (typeof row !== 'object' || row === null) throw new Error('progressRows: row is not an object')
  const r = row as Record<string, unknown>
  if (typeof r.question_id !== 'string' || typeof r.student_id !== 'string') {
    throw new Error('progressRows: row ids are not strings')
  }
  if (typeof r.time_spent_ms !== 'number') throw new Error('progressRows: bad time_spent_ms')
  if (r.answered_at !== null && typeof r.answered_at !== 'string') {
    throw new Error('progressRows: bad answered_at')
  }
  return {
    question_id: r.question_id,
    student_id: r.student_id,
    answer: r.answer,
    time_spent_ms: r.time_spent_ms,
    answered_at: r.answered_at,
  }
}
