import { formatUtc } from '@/lib/utils/format-utc'
import type { AvailableInternalExam } from '../queries'

type SittingStatus = NonNullable<AvailableInternalExam['sitting']>['status']

export function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return formatUtc(d, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return ''
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return ''
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours} h`
  const days = Math.round(hours / 24)
  return `in ${days} d`
}

/** A closed or cancelled sitting never opens, so it must not promise that it will. */
export function sittingHint(status: SittingStatus | undefined): string {
  if (status === 'open') return 'Works while the sitting is open.'
  // The row is server-rendered and nothing refreshes it, so the student has to reload.
  if (status === 'scheduled') {
    return 'Opens when your invigilator starts the sitting — reload this page to check.'
  }
  return 'This sitting has ended. Ask your invigilator.'
}
