import { internalExamCodeEmail } from '@/lib/email/templates/internal-exam-code'
import { sittingCodeEmail } from '@/lib/email/templates/sitting-code'
import type { InternalExamCodeForEmail } from './email-queries'

type Sitting = { scheduledAt: string; mode: 'remote' | 'in_person'; status: string }

/** The sitting of a sitting code, or null for a legacy code (or a sitting code without its embed). */
export function sittingOf(p: InternalExamCodeForEmail): Sitting | null {
  return p.scheduledAt && p.mode && p.sittingStatus
    ? { scheduledAt: p.scheduledAt, mode: p.mode, status: p.sittingStatus }
    : null
}

/** The email for one code: the sitting template for a sitting code, else the legacy one. */
export function buildCodeEmail(
  p: InternalExamCodeForEmail,
  sitting: Sitting | null,
  examUrl: string,
) {
  const common = { studentName: p.studentName, subjectName: p.subjectName, code: p.code, examUrl }
  return sitting
    ? sittingCodeEmail({ ...common, scheduledAt: sitting.scheduledAt, mode: sitting.mode })
    : internalExamCodeEmail({ ...common, expiresAt: p.expiresAt })
}
