import { describe, expect, it } from 'vitest'
import { isSittingStatus, SITTING_STATUSES } from './sitting-status'

describe('isSittingStatus', () => {
  it.each(SITTING_STATUSES)('accepts %s', (status) => {
    expect(isSittingStatus(status)).toBe(true)
  })

  it.each([['hybrid'], [''], [null], [undefined], [1]])('rejects %s', (value) => {
    expect(isSittingStatus(value)).toBe(false)
  })
})
