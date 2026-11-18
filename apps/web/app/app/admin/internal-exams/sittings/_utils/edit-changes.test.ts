import { describe, expect, it } from 'vitest'
import type { SittingRow } from '../types'
import { editChanges } from './edit-changes'

const INV = '00000000-0000-4000-a000-0000000000b1'
const INV2 = '00000000-0000-4000-a000-0000000000b2'
const ISO = '2026-11-20T09:30:00.000Z'
const row = (status: string) =>
  ({
    status,
    scheduledAt: ISO,
    mode: 'remote',
    invigilatorId: INV,
    permittedMaterials: 'Calculator',
  }) as unknown as SittingRow
const same = {
  when: '2026-11-20T09:30',
  mode: 'remote' as const,
  invigilatorId: INV,
  materials: 'Calculator',
}

describe('editChanges', () => {
  it('returns null when nothing changed', () => {
    expect(editChanges(row('scheduled'), ISO, same)).toBeNull()
  })

  it('returns every changed field of a scheduled sitting', () => {
    const iso = '2026-11-21T10:00:00.000Z'
    expect(
      editChanges(row('scheduled'), iso, {
        when: '2026-11-21T10:00',
        mode: 'in_person',
        invigilatorId: INV2,
        materials: 'Map',
      }),
    ).toEqual({
      scheduledAt: iso,
      mode: 'in_person',
      invigilatorId: INV2,
      permittedMaterials: 'Map',
    })
  })

  it('treats blank materials as unchanged when the sitting has none', () => {
    const s = { ...row('scheduled'), permittedMaterials: null } as SittingRow
    expect(editChanges(s, ISO, { ...same, materials: '  ' })).toBeNull()
  })

  it('sends only the invigilator once the sitting is no longer scheduled', () => {
    expect(
      editChanges(row('open'), '2030-01-01T00:00:00.000Z', {
        when: '2030-01-01T00:00',
        mode: 'in_person',
        invigilatorId: INV2,
        materials: 'x',
      }),
    ).toEqual({ invigilatorId: INV2 })
  })

  it('returns null for a locked sitting when only locked fields changed', () => {
    expect(editChanges(row('open'), ISO, { ...same, mode: 'in_person', materials: 'x' })).toBeNull()
  })
})
