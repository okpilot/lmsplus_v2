import { formatUtc } from '@/lib/utils/format-utc'

const DAY = { day: 'numeric', month: 'short', year: 'numeric' } as const
const DAY_TIME = { ...DAY, hour: '2-digit', minute: '2-digit' } as const

/** "17 Nov 2026" */
export function fmtDate(iso: string): string {
  return formatUtc(iso, DAY, { label: false })
}

/** "18 Nov 2026, 09:30" (list column headed UTC). */
export function formatListDate(iso: string): string {
  return formatUtc(iso, DAY_TIME, { label: false })
}

/** "18 Nov 2026, 09:30 UTC" */
export function formatTitleDate(iso: string): string {
  return formatUtc(iso, DAY_TIME)
}
