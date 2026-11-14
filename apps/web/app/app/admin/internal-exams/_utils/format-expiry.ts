import { formatUtc } from '@/lib/utils/format-utc'

export function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return formatUtc(d, { dateStyle: 'medium', timeStyle: 'short' })
}
