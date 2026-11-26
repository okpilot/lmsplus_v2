import { type SittingMode, sittingModeLabel } from '@/lib/utils/sitting-mode-label'
import type { SittingStatus } from '../types'

const STATUS_LABEL: Record<SittingStatus, string> = {
  scheduled: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export function statusLabel(status: SittingStatus): string {
  return STATUS_LABEL[status]
}

export function modeLabel(mode: SittingMode): string {
  return sittingModeLabel(mode)
}

/** datetime-local value (no zone) read as UTC. Throws on a malformed value. */
export function utcInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Invalid date and time')
  return `${value}:00.000Z`
}

export function isoToUtcInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16)
}
