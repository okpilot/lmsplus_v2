import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('../actions/create-sitting', () => ({ createSitting: m.create }))
vi.mock('../actions/update-sitting', () => ({ updateSitting: m.update }))

import { defaultWhen, persist, toIsoOrNull } from './sitting-form'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'
const INV2 = '00000000-0000-4000-a000-0000000000b2'
const sitting = {
  id: SID,
  status: 'scheduled',
  scheduledAt: '2026-11-20T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: INV,
  permittedMaterials: null,
} as never
const values = {
  when: '2026-11-20T09:30',
  mode: 'remote',
  invigilatorId: INV,
  materials: '',
} as const

beforeEach(() => vi.resetAllMocks())

describe('defaultWhen', () => {
  it('is tomorrow 09:00 UTC in datetime-local form', () => {
    expect(defaultWhen()).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/)
  })

  it('rolls over the month and year boundary', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-12-31T23:30:00.000Z'))
      expect(defaultWhen()).toBe('2027-01-01T09:00')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('toIsoOrNull', () => {
  it('converts a valid input and returns null for garbage', () => {
    expect(toIsoOrNull('2026-11-21T10:00')).toBe('2026-11-21T10:00:00.000Z')
    expect(toIsoOrNull('')).toBeNull()
  })
})

describe('persist', () => {
  it('creates with materials only when non-blank and returns the new id', async () => {
    m.create.mockResolvedValue({ success: true, sittingId: SID })
    const iso = '2026-11-21T10:00:00.000Z'
    expect(await persist(undefined, iso, { ...values, materials: ' ' })).toEqual({ id: SID })
    expect(m.create).toHaveBeenCalledWith({ scheduledAt: iso, mode: 'remote', invigilatorId: INV })
    await persist(undefined, iso, { ...values, materials: 'Calc' })
    expect(m.create).toHaveBeenLastCalledWith({
      scheduledAt: iso,
      mode: 'remote',
      invigilatorId: INV,
      permittedMaterials: 'Calc',
    })
  })

  it('returns the create error', async () => {
    m.create.mockResolvedValue({ success: false, error: 'nope' })
    expect(await persist(undefined, '2026-11-21T10:00:00.000Z', values)).toEqual({ error: 'nope' })
  })

  it('returns id null without calling update when nothing changed', async () => {
    expect(await persist(sitting, '2026-11-20T09:30:00.000Z', values)).toEqual({ id: null })
    expect(m.update).not.toHaveBeenCalled()
  })

  it('updates only the changed field', async () => {
    m.update.mockResolvedValue({ success: true })
    expect(
      await persist(sitting, '2026-11-20T09:30:00.000Z', { ...values, invigilatorId: INV2 }),
    ).toEqual({ id: SID })
    expect(m.update).toHaveBeenCalledWith({ sittingId: SID, invigilatorId: INV2 })
  })

  it('returns the update error', async () => {
    m.update.mockResolvedValue({ success: false, error: 'bad' })
    expect(
      await persist(sitting, '2026-11-20T09:30:00.000Z', { ...values, invigilatorId: INV2 }),
    ).toEqual({ error: 'bad' })
  })
})
