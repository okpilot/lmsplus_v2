import { createServerSupabaseClient } from '@repo/db/server'

// SECURITY: code values are NEVER returned from this query. Admin distributes
// codes out-of-band; student types via the redemption modal. Shape omits `code`.
export type AvailableInternalExam = {
  id: string
  subjectId: string
  subjectName: string
  subjectShort: string
  expiresAt: string
  issuedAt: string
}

export type InternalExamHistoryEntry = {
  id: string
  subjectId: string
  subjectName: string
  subjectShort: string
  startedAt: string
  endedAt: string | null
  scorePercentage: number | null
  passed: boolean | null
  totalQuestions: number
  answeredCount: number
  attemptNumber: number
}

type SubjectRel = { name?: unknown; short?: unknown } | null

function readSubjectField(rel: SubjectRel, field: 'name' | 'short'): string {
  const value = rel?.[field]
  return typeof value === 'string' ? value : ''
}

// internal_exam_codes is not in generated types; mirror admin/internal-exams/queries.ts.
type ChainBuilder = {
  select: (cols: string) => ChainBuilder
  eq: (col: string, val: unknown) => ChainBuilder
  is: (col: string, val: unknown) => ChainBuilder
  gt: (col: string, val: unknown) => ChainBuilder
  in: (col: string, values: unknown[]) => ChainBuilder
  order: (col: string, opts: { ascending: boolean }) => ChainBuilder
  limit: (n: number) => ChainBuilder
}

type AnyClient = { from: (t: string) => ChainBuilder }

type QueryResult = { data: unknown; error: { message: string } | null }
async function runQuery(builder: ChainBuilder): Promise<QueryResult> {
  return (await (builder as unknown as PromiseLike<QueryResult>)) ?? { data: null, error: null }
}

type AvailableRow = {
  id: string
  subject_id: string
  expires_at: string
  issued_at: string
  easa_subjects: SubjectRel
}

type SessionRow = {
  id: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  score_percentage: number | null
  passed: boolean | null
  total_questions: number
  easa_subjects: SubjectRel
}

type AnswerRow = { session_id: string | null }

/**
 * Returns the current student's unconsumed, unvoided, unexpired internal-exam
 * codes. NEVER returns the code value itself — that is a privileged secret the
 * admin gives to the student out-of-band.
 */
export async function listAvailableInternalExams(): Promise<AvailableInternalExam[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const client = supabase as unknown as AnyClient
  const builder = client
    .from('internal_exam_codes')
    .select('id, subject_id, expires_at, issued_at, easa_subjects(name, short)')
    .eq('student_id', user.id)
    .is('consumed_at', null)
    .is('voided_at', null)
    .gt('expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('expires_at', { ascending: true })
    .limit(100)

  const { data, error } = await runQuery(builder)
  if (error) {
    console.error('[listAvailableInternalExams] Query error:', error.message)
    return []
  }

  const rows = Array.isArray(data) ? (data as AvailableRow[]) : []
  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subject_id,
    subjectName: readSubjectField(row.easa_subjects, 'name') || 'Unknown subject',
    subjectShort: readSubjectField(row.easa_subjects, 'short'),
    expiresAt: row.expires_at,
    issuedAt: row.issued_at,
  }))
}

/**
 * Computes per-subject 1-indexed attempt numbers in TS from started_at order.
 * attemptNumber=1 is the OLDEST attempt for that subject.
 */
function computeAttemptNumbers(rows: SessionRow[]): Map<string, number> {
  // Sort ascending so attempt 1 = oldest. Group by subject.
  const ascending = [...rows].sort((a, b) =>
    a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0,
  )
  const counters = new Map<string, number>()
  const result = new Map<string, number>()
  for (const row of ascending) {
    const key = row.subject_id ?? '__no_subject__'
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    result.set(row.id, next)
  }
  return result
}

/**
 * Returns the current student's internal-exam session history, newest first.
 * `attemptNumber` is computed per subject (1 = oldest attempt for that subject).
 */
export async function listMyInternalExamHistory(): Promise<InternalExamHistoryEntry[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const client = supabase as unknown as AnyClient
  const sessionBuilder = client
    .from('quiz_sessions')
    .select(
      'id, subject_id, started_at, ended_at, score_percentage, passed, total_questions, easa_subjects(name, short)',
    )
    .eq('student_id', user.id)
    .eq('mode', 'internal_exam')
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(200)

  const { data: sessionData, error: sessionError } = await runQuery(sessionBuilder)
  if (sessionError) {
    console.error('[listMyInternalExamHistory] Query error:', sessionError.message)
    return []
  }

  const rows = Array.isArray(sessionData) ? (sessionData as SessionRow[]) : []
  if (rows.length === 0) return []

  const attemptByRow = computeAttemptNumbers(rows)

  const sessionIds = rows.map((r) => r.id)
  const answersBuilder = client
    .from('quiz_session_answers')
    .select('session_id')
    .in('session_id', sessionIds)

  const { data: answersData, error: answersError } = await runQuery(answersBuilder)
  if (answersError) {
    console.error('[listMyInternalExamHistory] Answers query error:', answersError.message)
  }

  const answeredBySession = new Map<string, number>()
  const answers = Array.isArray(answersData) ? (answersData as AnswerRow[]) : []
  for (const a of answers) {
    if (!a.session_id) continue
    answeredBySession.set(a.session_id, (answeredBySession.get(a.session_id) ?? 0) + 1)
  }

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subject_id ?? '',
    subjectName: readSubjectField(row.easa_subjects, 'name') || 'Unknown subject',
    subjectShort: readSubjectField(row.easa_subjects, 'short'),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    scorePercentage: row.score_percentage,
    passed: row.passed,
    totalQuestions: row.total_questions,
    answeredCount: answeredBySession.get(row.id) ?? 0,
    attemptNumber: attemptByRow.get(row.id) ?? 1,
  }))
}
