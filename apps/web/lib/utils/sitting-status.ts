export const SITTING_STATUSES = ['scheduled', 'open', 'closed', 'cancelled'] as const

export type SittingStatus = (typeof SITTING_STATUSES)[number]

export function isSittingStatus(v: unknown): v is SittingStatus {
  return SITTING_STATUSES.some((s) => s === v)
}
