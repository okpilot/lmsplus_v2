import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'

export type CurrentSection = { sectionNo: number; type: string; isLast: boolean }

/**
 * First planned section (in section_no order) with no response yet; null when
 * all planned sections have been submitted. `isLast` is true when it is the only
 * remaining unsubmitted section — submitting it finalizes the session.
 */
export function nextUnsubmittedSection(session: OralSessionDetail): CurrentSection | null {
  const submitted = new Set(session.responses.map((r) => r.sectionNo))
  const pending = [...session.sections]
    .sort((a, b) => a.sectionNo - b.sectionNo)
    .filter((s) => !submitted.has(s.sectionNo))
  const first = pending[0]
  if (!first) return null
  return { sectionNo: first.sectionNo, type: first.type, isLast: pending.length === 1 }
}
