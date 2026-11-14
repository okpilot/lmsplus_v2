/** Formats a date in en-GB UTC (caller timeZone ignored); appends " UTC" when a time part is shown; invalid dates give "Invalid Date". */
export function formatUtc(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid Date'
  const text = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date)
  return options.timeStyle || options.hour ? `${text} UTC` : text
}
