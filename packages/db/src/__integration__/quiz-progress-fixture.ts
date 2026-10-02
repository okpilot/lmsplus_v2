import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult } from './guards'
import { orderingItem } from './ordering-item-id'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

export const PASSWORD = 'test-pass-123'
export const ORDER_ITEMS = [orderingItem('first call'), orderingItem('second call')]

export type ProgressFixture = {
  admin: SupabaseClient
  orgId: string
  studentId: string
  otherStudentId: string
  student: SupabaseClient
  other: SupabaseClient
  /** Five multiple_choice questions (correct option 'b'). */
  mcIds: string[]
  shortId: string
  dialogId: string
  orderingId: string
  diagramId: string
  teardown: () => Promise<void>
}

type Refs = Awaited<ReturnType<typeof seedReferenceData>>

async function insertQuestion(admin: SupabaseClient, row: Record<string, unknown>) {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  return requireRpcResult<{ id: string }>(data, 'insertQuestion').id
}

/** Org + two students + one question of every type, for the quiz-progress suites. */
export async function setupProgressFixture(tag: string): Promise<ProgressFixture> {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const userIds: string[] = []
  const orgId = await createTestOrg({
    admin,
    name: `Test Org ${tag} ${suffix}`,
    slug: `test-${tag}-${suffix}`,
  })
  const mk = async (role: 'admin' | 'student', name: string) => {
    const email = `${name}-${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: PASSWORD, role })
    userIds.push(id)
    return { id, email }
  }
  const adminUser = await mk('admin', 'admin')
  const a = await mk('student', 'studenta')
  const b = await mk('student', 'studentb')
  const refs: Refs = await seedReferenceData({
    admin,
    subjectCode: `P${suffix}`,
    subjectName: `Progress Subject ${suffix}`,
    topicCode: `P${suffix}-01`,
    topicName: `Progress Topic ${suffix}`,
  })
  const seeded = await seedQuestions({
    admin,
    orgId,
    createdBy: adminUser.id,
    subjectId: refs.subjectId,
    topicId: refs.topicId,
    count: 5,
  })
  const base = {
    organization_id: orgId,
    bank_id: seeded.bankId,
    subject_id: refs.subjectId,
    topic_id: refs.topicId,
    subtopic_id: null,
    difficulty: 'medium',
    status: 'active',
    created_by: adminUser.id,
  }
  const shortId = await insertQuestion(admin, {
    ...base,
    question_type: 'short_answer',
    question_text: 'Acknowledge?',
    canonical_answer: 'wilco',
    explanation_text: 'SA explanation',
  })
  const dialogId = await insertQuestion(admin, {
    ...base,
    question_type: 'dialog_fill',
    question_text: 'Dialog',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ index: 0, canonical: 'cleared', synonyms: [] }],
    explanation_text: 'DF explanation',
  })
  const orderingId = await insertQuestion(admin, {
    ...base,
    question_type: 'ordering',
    question_text: 'Sequence',
    ordering_items: ORDER_ITEMS,
    explanation_text: 'Ordering explanation',
  })
  const diagramId = await insertQuestion(admin, {
    ...base,
    question_type: 'diagram_label',
    question_text: 'Label the circuit',
    diagram_config: {
      image_ref: 'rwy-27-09-lh-pattern',
      zones: [{ id: 'zone-1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
      labels: [{ id: 'lbl-1', text: 'Downwind' }],
      answer: [{ zone_id: 'zone-1', label_id: 'lbl-1' }],
    },
    explanation_text: 'Diagram explanation',
  })
  return {
    admin,
    orgId,
    studentId: a.id,
    otherStudentId: b.id,
    student: await getAuthenticatedClient({ email: a.email, password: PASSWORD }),
    other: await getAuthenticatedClient({ email: b.email, password: PASSWORD }),
    mcIds: seeded.questionIds,
    shortId,
    dialogId,
    orderingId,
    diagramId,
    teardown: async () => {
      await cleanupTestData({ admin, orgId, userIds })
      await cleanupReferenceData({ admin, refs: [refs] })
    },
  }
}

export type SessionMode = 'mock_exam' | 'internal_exam' | 'vfr_rt_exam' | 'discovery'

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
  return data as Array<{
    question_id: string
    student_id: string
    answer: unknown
    time_spent_ms: number
    answered_at: string | null
  }>
}
