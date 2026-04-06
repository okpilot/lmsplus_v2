import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { SessionSort, StudentDetail, StudentSession, StudentSessionFilters } from '../../types'
import { PAGE_SIZE } from '../../types'

function rangeToCutoff(range: string): string | null {
  const map: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
  const days = map[range]
  if (!days) return null
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return cutoff.toISOString()
}

export async function getStudentDetail(studentId: string): Promise<StudentDetail | null> {
  const { organizationId } = await requireAdmin()

  const { data, error } = await adminClient
    .from('users')
    .select('id, full_name, email, role, last_active_at, created_at, deleted_at')
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[getStudentDetail] Query error:', error.message)
    throw new Error('Failed to fetch student detail')
  }

  if (!data) return null

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    role: data.role,
    lastActiveAt: data.last_active_at,
    createdAt: data.created_at,
    isActive: data.deleted_at === null,
  }
}

const SESSION_SORT_MAP: Record<SessionSort, string> = {
  date: 'ended_at',
  subject: 'subject_id',
  topic: 'topic_id',
  mode: 'mode',
  score: 'score_percentage',
  questions: 'total_questions',
  duration: 'started_at',
}

export async function getStudentSessions(
  studentId: string,
  filters: StudentSessionFilters,
): Promise<{ sessions: StudentSession[]; totalCount: number }> {
  const { organizationId } = await requireAdmin()

  let query = adminClient
    .from('quiz_sessions')
    .select(
      'id, mode, score_percentage, total_questions, correct_count, started_at, ended_at, easa_subjects(name), easa_topics(name)',
      { count: 'exact' },
    )
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('ended_at', 'is', null)

  const cutoff = rangeToCutoff(filters.range)
  if (cutoff) {
    query = query.gte('ended_at', cutoff)
  }

  const sortCol = SESSION_SORT_MAP[filters.sort] ?? 'ended_at'
  query = query.order(sortCol, { ascending: filters.dir === 'asc' })

  const from = (filters.page - 1) * PAGE_SIZE
  query = query.range(from, from + PAGE_SIZE - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[getStudentSessions] Query error:', error.message)
    throw new Error('Failed to fetch student sessions')
  }

  type SessionRow = {
    id: string
    mode: string
    score_percentage: number | null
    total_questions: number
    correct_count: number
    started_at: string
    ended_at: string | null
    easa_subjects: { name: string } | null
    easa_topics: { name: string } | null
  }

  const sessions: StudentSession[] = ((data ?? []) as SessionRow[]).map((row) => ({
    sessionId: row.id,
    subjectName: row.easa_subjects?.name ?? null,
    topicName: row.easa_topics?.name ?? null,
    mode: row.mode,
    scorePercentage: row.score_percentage,
    totalQuestions: row.total_questions,
    correctCount: row.correct_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }))

  return { sessions, totalCount: count ?? 0 }
}
