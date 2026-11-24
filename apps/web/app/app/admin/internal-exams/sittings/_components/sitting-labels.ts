import type { SittingStatus } from '../types'

const MODE_LABEL = { remote: 'Remote', in_person: 'In person' } as const

const STATUS_LABEL: Record<SittingStatus, string> = {
  scheduled: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export function statusLabel(status: SittingStatus): string {
  return STATUS_LABEL[status]
}

export function modeLabel(mode: keyof typeof MODE_LABEL): string {
  return MODE_LABEL[mode]
}

/** datetime-local value (no zone) read as UTC. Throws on a malformed value. */
export function utcInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Invalid date and time')
  return `${value}:00.000Z`
}

export function isoToUtcInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16)
}
