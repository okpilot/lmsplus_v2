import { formatUtc } from '@/lib/utils/format-utc'
import type { AvailableInternalExam } from '../queries'

type SittingStatus = NonNullable<AvailableInternalExam['sitting']>['status']

/** A sitting is startable only while it is open; an unknown status is not open. */
export function canStart(status: SittingStatus | null | undefined): boolean {
  return status === 'open'
}

/** The sitting date, or null when it cannot be parsed — never the words "Invalid Date". */
export function sittingWhen(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return formatUtc(d, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return formatUtc(d, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return ''
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'expired'
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours} h`
  const days = Math.round(hours / 24)
  return `in ${days} d`
}

/**
 * `scheduled` and `open` are the only statuses reachable here: `list_my_active_internal_exam_codes`
 * (mig 20261117001250) needs a live `exam_sittings` row and `voided_at IS NULL`, and close and
 * cancel both void every unused code first (`private.void_unused_sitting_codes`). Anything else
 * takes the fallback rather than naming a state this path cannot produce.
 */
export function sittingHint(status: SittingStatus | null | undefined): string {
  if (status === 'open') return 'Works while the sitting is open.'
  // The row is server-rendered and nothing refreshes it, so the student has to reload.
  if (status === 'scheduled') {
    return 'Opens when your invigilator starts the sitting — reload this page to check.'
  }
  return 'Ask your invigilator about this sitting.'
}
