export const STATUS_ITEMS = [
  { value: '__all__', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'consumed', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
  { value: 'voided', label: 'Voided' },
  { value: 'expired', label: 'Expired' },
] as const

export function statusLabel(status: string): string {
  if (status === 'waiting') return 'Waiting for start'
  return STATUS_ITEMS.find((i) => i.value === status)?.label ?? status
}
