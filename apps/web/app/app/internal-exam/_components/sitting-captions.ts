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

/** A closed or cancelled sitting never opens, so it must not promise that it will. */
export function sittingHint(status: SittingStatus | null | undefined): string {
  if (status === 'open') return 'Works while the sitting is open.'
  // The row is server-rendered and nothing refreshes it, so the student has to reload.
  if (status === 'scheduled') {
    return 'Opens when your invigilator starts the sitting — reload this page to check.'
  }
  // A cancelled sitting never ran, so it cannot be described as having ended.
  if (status === 'cancelled') return 'This sitting was cancelled. Ask your invigilator.'
  if (status === 'closed') return 'This sitting has ended. Ask your invigilator.'
  return 'Ask your invigilator about this sitting.'
}
