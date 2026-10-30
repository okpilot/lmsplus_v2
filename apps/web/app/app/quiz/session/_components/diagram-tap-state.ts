import { placeLabel, unplaceLabel } from './diagram-label-input-helpers'

export type Armed = { kind: 'label' | 'zone'; id: string } | null
export type TapState = Readonly<{ placement: Map<string, string>; armed: Armed }>

function toggleArmed(armed: Armed, next: NonNullable<Armed>): Armed {
  return armed?.kind === next.kind && armed.id === next.id ? null : next
}

/** Tap a label chip in the pool: place into an armed zone, else arm/disarm the label. */
export function tapLabel({ placement, armed }: TapState, labelId: string): TapState {
  if (armed?.kind === 'zone')
    return { placement: placeLabel(placement, armed.id, labelId), armed: null }
  return { placement, armed: toggleArmed(armed, { kind: 'label', id: labelId }) }
}

/** Tap an answer row: place an armed label, else arm the placed chip or the empty zone. */
export function tapRow({ placement, armed }: TapState, zoneId: string): TapState {
  const here = placement.get(zoneId)
  if (armed?.kind === 'label' && armed.id !== here) {
    return { placement: placeLabel(placement, zoneId, armed.id), armed: null }
  }
  if (here) return { placement, armed: toggleArmed(armed, { kind: 'label', id: here }) }
  return { placement, armed: toggleArmed(armed, { kind: 'zone', id: zoneId }) }
}

/** Tap the pool background: return an armed placed label to the pool, then disarm. */
export function tapPool({ placement, armed }: TapState): TapState {
  if (armed?.kind === 'label' && [...placement.values()].includes(armed.id)) {
    return { placement: unplaceLabel(placement, armed.id), armed: null }
  }
  return { placement, armed: null }
}
