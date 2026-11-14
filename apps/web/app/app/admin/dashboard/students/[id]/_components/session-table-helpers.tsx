import { formatUtc } from '@/lib/utils/format-utc'

export function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '\u2014'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  return formatUtc(
    iso,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
    { label: false },
  )
}
