import type { IssueCounts } from '../actions/issue-sitting-codes'
import type { ResultBannerData } from './copy'
import { fmtDate, formatTitleDate } from './format-dates'
import { plural } from './plural'

/** Most exam pairs one Add exams call may send. */
export const MAX_PAIRS = 1000

type AddedPeople = { added: number; skippedExisting: number; skippedDeactivated: number }

export function addPeopleBanner(r: AddedPeople): ResultBannerData {
  const skipped = [
    r.skippedExisting > 0 ? `${r.skippedExisting} already in this sitting` : '',
    r.skippedDeactivated > 0 ? `${r.skippedDeactivated} deactivated` : '',
  ].filter(Boolean)
  return {
    tone: r.added === 0 ? 'caution' : 'success',
    title: `Added ${plural(r.added, 'person', 'people')}.`,
    ...(skipped.length > 0 ? { detail: `Skipped: ${skipped.join('; ')}.` } : {}),
  }
}

/** Label of the Add whole group button; zero clauses are left out. */
export function groupAddLabel(name: string, activeNew: number, deactivatedNew: number): string {
  const clauses = [
    activeNew > 0 ? `${activeNew} new` : '',
    deactivatedNew > 0 ? `${deactivatedNew} deactivated skipped` : '',
  ].filter(Boolean)
  const base = `Add whole group "${name}"`
  return clauses.length > 0 ? `${base} (${clauses.join(', ')})` : base
}

/** Why one person/exam pair was not added; `at` is the RPC `detail_at`. */
export function skipReasonText(reason: string, at?: string): string {
  switch (reason) {
    case 'existing':
      return 'already in this sitting'
    case 'not_candidate':
      return 'not in this sitting'
    case 'deactivated':
      return 'deactivated'
    case 'not_enrolled':
      return 'not enrolled'
    case 'attempt_running':
      return 'attempt running'
    case 'passed':
      return at ? `already passed on ${fmtDate(at)}` : 'already passed'
    case 'entered_elsewhere':
      return at ? `in another sitting on ${formatTitleDate(at)}` : 'in another sitting'
    default:
      return 'skipped'
  }
}

type AddedExams = {
  added: number
  skippedTotal: number
  skipped: readonly { person: string; subjectId: string; reason: string; detailAt?: string }[]
}

export function addExamsBanner(
  r: AddedExams,
  shortOf: (subjectId: string) => string | undefined,
): ResultBannerData {
  const title = `Added ${plural(r.added, 'exam')}.`
  if (r.skippedTotal === 0) return { tone: 'success', title }
  const lines = r.skipped.map(
    (s) => `${s.person} · ${shortOf(s.subjectId) ?? '-'}: ${skipReasonText(s.reason, s.detailAt)}`,
  )
  const listed = r.skippedTotal > lines.length ? `. The first ${lines.length} are listed:` : ':'
  return {
    tone: 'caution',
    title,
    detail: `Skipped ${plural(r.skippedTotal, 'exam')}${listed}`,
    lines,
  }
}

/** "Ann, Bob and 2 more are also in a sitting today (09:30 UTC)." */
export function sameDayText(people: readonly { name: string; scheduledAt: string }[]): string {
  if (people.length === 0) return ''
  const names = people.slice(0, 3).map((p) => p.name)
  const rest = people.length - names.length
  const earliest = people.map((p) => p.scheduledAt).sort((a, b) => a.localeCompare(b))[0] ?? ''
  const time = new Date(earliest).toISOString().slice(11, 16)
  const tail = rest > 0 ? `${rest} more` : names.pop()
  const who = names.length > 0 ? `${names.join(', ')} and ${tail}` : tail
  return `${who} ${people.length === 1 ? 'is' : 'are'} also in a sitting today (${time} UTC).`
}

export function tooManyPairsText(people: number, exams: number): string {
  return `Too many: ${plural(people, 'person', 'people')} x ${plural(exams, 'exam')} = ${people * exams}; the limit is ${MAX_PAIRS}. Untick exams.`
}

export function issuePreviewLine(codes: number, students: number): string {
  return `Will issue ${plural(codes, 'code')} for ${plural(students, 'student')}.`
}

/** Plan skip reasons the Issue popup groups by (`already_issued` is a plain line, not a skip). */
export const ISSUE_SKIP_LABEL: Readonly<Record<string, string>> = {
  attempt_taken: 'attempt already taken',
  passed: 'already passed',
  no_longer_enrolled: 'no longer enrolled',
  deactivated: 'deactivated',
  exam_disabled: 'exam disabled',
}

/** Result of Issue; `previewTotal` is what the preview promised (issued + re-issued), null when unknown. */
export function issuePopupBanner(d: IssueCounts, previewTotal: number | null): ResultBannerData {
  const skips: [number, string][] = [
    [d.skippedAttemptTaken, ISSUE_SKIP_LABEL.attempt_taken ?? ''],
    [d.skippedPassed, ISSUE_SKIP_LABEL.passed ?? ''],
    [d.skippedNotEnrolled, ISSUE_SKIP_LABEL.no_longer_enrolled ?? ''],
    [d.skippedDeactivated, ISSUE_SKIP_LABEL.deactivated ?? ''],
    [d.skippedNoConfig, ISSUE_SKIP_LABEL.exam_disabled ?? ''],
  ]
  const skipped = skips.filter(([n]) => n > 0)
  const skippedTotal = skipped.reduce((sum, [n]) => sum + n, 0)
  const parts = [
    d.reissuedAfterExpiry > 0 ? `Re-issued ${plural(d.reissuedAfterExpiry, 'expired code')}.` : '',
    d.skippedAlreadyIssued > 0
      ? `${plural(d.skippedAlreadyIssued, 'exam')} already had a code.`
      : '',
    skippedTotal > 0
      ? `${skippedTotal} skipped: ${skipped.map(([n, l]) => `${n} ${l}`).join(', ')}.`
      : '',
    previewTotal !== null && previewTotal !== d.issued ? 'Counts changed since the preview.' : '',
  ].filter(Boolean)
  return {
    tone: skippedTotal > 0 ? 'caution' : 'success',
    title: `Issued ${plural(d.issued, 'code')}.`,
    ...(parts.length > 0 ? { detail: parts.join(' ') } : {}),
  }
}
