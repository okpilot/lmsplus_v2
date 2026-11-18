import { isoToUtcInput } from '../_components/sitting-labels'
import type { SittingRow } from '../types'

export type SittingFormValues = {
  when: string
  mode: 'remote' | 'in_person'
  invigilatorId: string
}

/** Fields that differ from the loaded sitting; a started sitting only ever sends the invigilator. Null when nothing changed. */
export function editChanges(sitting: SittingRow, iso: string, v: SittingFormValues) {
  const locked = sitting.status !== 'scheduled'
  const changes: {
    scheduledAt?: string
    mode?: 'remote' | 'in_person'
    invigilatorId?: string
  } = {}
  if (!locked) {
    if (v.when !== isoToUtcInput(sitting.scheduledAt)) changes.scheduledAt = iso
    if (v.mode !== sitting.mode) changes.mode = v.mode
  }
  if (v.invigilatorId !== sitting.invigilatorId) changes.invigilatorId = v.invigilatorId
  return Object.keys(changes).length > 0 ? changes : null
}
