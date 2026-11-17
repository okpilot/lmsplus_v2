import { describe, expect, it } from 'vitest'
import { STATUS_ITEMS, statusLabel } from './code-status-items'

describe('statusLabel', () => {
  it.each(STATUS_ITEMS.map((i) => [i.value, i.label] as const))('maps %s to %s', (value, label) => {
    expect(statusLabel(value)).toBe(label)
  })

  it('labels consumed as In progress', () => {
    expect(statusLabel('consumed')).toBe('In progress')
  })

  it('returns the raw status when unknown', () => {
    expect(statusLabel('mystery')).toBe('mystery')
  })
})
