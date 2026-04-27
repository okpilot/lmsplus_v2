export function parseStartedAt(startedAt: string | undefined): number {
  if (!startedAt) return Date.now()
  const parsed = new Date(startedAt).getTime()
  return Number.isFinite(parsed) ? parsed : Date.now()
}
