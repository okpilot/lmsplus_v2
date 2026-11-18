export const SITTING_BASE = '/app/admin/internal-exams/sittings'

export type SittingScope = 'upcoming' | 'open' | 'past' | 'cancelled'
export const SITTING_SCOPES: readonly SittingScope[] = ['upcoming', 'open', 'past', 'cancelled']

export const SITTINGS_PAGE_SIZE = 50

export type SittingStatus = 'scheduled' | 'open' | 'closed' | 'cancelled'

export type SittingRow = {
  id: string
  scheduledAt: string
  mode: 'remote' | 'in_person'
  status: SittingStatus
  invigilatorId: string
  invigilatorName: string
  invigilatorActive: boolean
  permittedMaterials: string | null
  startedAt: string | null
  closedAt: string | null
  candidates: number
  entries: number
  entriesWithoutCode: number
  entriesFinished: number
  entriesAbsent: number
  endedAutomatically: boolean
}

export type SittingSummary = {
  status: SittingStatus
  scheduledAt: string
  candidates: number
  entries: number
  codesIssued: number
  dayEnded: boolean
  attemptsRunning: number
  entriesNotStarted: number
  studentsNotStarted: number
}

export type InvigilatorOption = { id: string; name: string }
