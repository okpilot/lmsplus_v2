import { describe, expect, it } from 'vitest'
import { LIVE_ENTRY_STATUSES } from './types'

describe('LIVE_ENTRY_STATUSES', () => {
  it('is exactly the statuses holding a usable unspent code', () => {
    expect([...LIVE_ENTRY_STATUSES].sort()).toEqual(['ready', 'waiting'])
  })
})
