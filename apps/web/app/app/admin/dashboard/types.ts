export const STUDENTS_PAGE_SIZE = 10
export const SESSIONS_PAGE_SIZE = 25

export type TimeRange = '7d' | '30d' | '90d' | 'all'

export type DashboardKpis = {
  activeStudents: number
  totalStudents: number
  avgMastery: number
  sessionsThisPeriod: number
  weakestSubject: { name: string; short: string; avgMastery: number } | null
  examReadyStudents: number
}

export type DashboardStudent = {
  id: string
  fullName: string | null
  email: string
  lastActiveAt: string | null
  sessionCount: number
  avgScore: number | null
  mastery: number
  isActive: boolean
  hasRecentActivity: boolean
}

export type DashboardFilters = {
  range: TimeRange
  page: number
  sort: 'name' | 'lastActive' | 'sessions' | 'avgScore' | 'mastery'
  dir: 'asc' | 'desc'
  status: 'active' | 'inactive' | undefined
}

export type WeakTopic = {
  topicId: string
  topicName: string
  subjectName: string
  subjectShort: string
  avgScore: number
  studentCount: number
}

export type RecentSession = {
  sessionId: string
  studentName: string | null
  subjectName: string | null
  mode: string
  scorePercentage: number | null
  endedAt: string
}

export type StudentDetail = {
  id: string
  fullName: string | null
  email: string
  role: string
  lastActiveAt: string | null
  createdAt: string
  deletedAt: string | null
}

export type StudentSession = {
  sessionId: string
  subjectName: string | null
  topicName: string | null
  mode: string
  scorePercentage: number | null
  totalQuestions: number
  correctCount: number
  startedAt: string
  endedAt: string | null
}

export type SessionSort = 'date' | 'mode' | 'score' | 'questions'

export type StudentSessionFilters = {
  range: TimeRange
  page: number
  sort: SessionSort
  dir: 'asc' | 'desc'
}
