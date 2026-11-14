import { formatUtc } from '@/lib/utils/format-utc'

export function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function formatDate(iso: string) {
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
