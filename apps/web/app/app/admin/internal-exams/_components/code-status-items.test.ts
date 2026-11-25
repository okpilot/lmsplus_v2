import { describe, expect, it } from 'vitest'
import { CODE_FILTER_STATUSES } from '../types'
import { STATUS_ITEMS, statusLabel } from './code-status-items'

describe('statusLabel', () => {
  it.each([
    ['active', 'Active'],
    ['waiting', 'Waiting for start'],
    ['consumed', 'In progress'],
    ['finished', 'Finished'],
    ['voided', 'Voided'],
    ['expired', 'Expired'],
  ])('labels %s as %s', (status, label) => {
    expect(statusLabel(status)).toBe(label)
  })

  it('returns the raw status when unknown', () => {
    expect(statusLabel('mystery')).toBe('mystery')
  })
})

describe('filter items', () => {
  it('names the active filter after both statuses it returns', () => {
    expect(STATUS_ITEMS.find((i) => i.value === 'active')?.label).toBe('Active / Waiting')
  })

  it('does not offer waiting as a filter item', () => {
    expect(STATUS_ITEMS.map((i) => i.value)).not.toContain('waiting')
  })
})

describe('STATUS_ITEMS covers the filter statuses', () => {
  it('offers All plus every value the URL parser accepts, in order', () => {
    expect(STATUS_ITEMS.map((i) => i.value)).toEqual(['__all__', ...CODE_FILTER_STATUSES])
  })

  it('labels every offered status', () => {
    for (const item of STATUS_ITEMS) {
      expect(item.label).not.toBe('')
    }
  })
})
