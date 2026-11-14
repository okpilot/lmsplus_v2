const TIME_PARTS = new Set<Intl.DateTimeFormatPartTypes>([
  'hour',
  'minute',
  'second',
  'dayPeriod',
  'fractionalSecond',
])

/** Formats a date in en-GB UTC (no caller timeZone); appends " UTC" when a time part is shown and no zone name is; invalid dates give "Invalid Date". */
export function formatUtc(
  value: string | number | Date,
  options: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid Date'
  const fmt = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' })
  const parts = fmt.formatToParts(date)
  const text = parts.map((p) => p.value).join('')
  const hasTime = parts.some((p) => TIME_PARTS.has(p.type))
  const hasZone = parts.some((p) => p.type === 'timeZoneName')
  return hasTime && !hasZone ? `${text} UTC` : text
}
