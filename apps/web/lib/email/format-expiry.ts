import { formatUtc } from '@/lib/utils/format-utc'

/** Formats an ISO timestamp as a long UTC date and time; returns the input unchanged when it is not a valid date. */
export function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return expiresAt
  return formatUtc(date, {
    dateStyle: 'long',
    timeStyle: 'short',
  })
}
