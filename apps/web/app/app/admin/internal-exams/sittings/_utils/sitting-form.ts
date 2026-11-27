import { utcInputToIso } from '../_components/sitting-labels'
import { createSitting } from '../actions/create-sitting'
import { updateSitting } from '../actions/update-sitting'
import type { SittingRow } from '../types'
import { editChanges, type SittingFormValues } from './edit-changes'

export function defaultWhen(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(9, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

export function toIsoOrNull(value: string): string | null {
  try {
    return utcInputToIso(value)
  } catch {
    return null
  }
}

/** Create, or update only what changed. Returns the sitting id, `{ id: null }` when nothing changed, or an error message. */
export async function persist(sitting: SittingRow | undefined, iso: string, v: SittingFormValues) {
  if (sitting) {
    const changes = editChanges(sitting, iso, v)
    if (!changes) return { id: null }
    const r = await updateSitting({ sittingId: sitting.id, ...changes })
    return r.success ? { id: sitting.id, notices: r.notices } : { error: r.error }
  }
  const r = await createSitting({
    scheduledAt: iso,
    mode: v.mode,
    invigilatorId: v.invigilatorId,
  })
  return r.success ? { id: r.sittingId } : { error: r.error }
}
