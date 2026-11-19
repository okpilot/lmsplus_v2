import { describe, expect, it } from 'vitest'
import { SITTING_RPC_ERRORS } from '../actions/sitting-action-result'
import { sittingEmailRefusal } from './sitting-email-gate'

const FUTURE = '2999-01-01T09:00:00.000Z'
const PAST = '2000-01-01T09:00:00.000Z'

describe('sittingEmailRefusal', () => {
  it.each(['closed', 'cancelled'])(
    'refuses a %s sitting with the sitting_closed copy',
    (status) => {
      expect(sittingEmailRefusal(status, FUTURE)).toBe(SITTING_RPC_ERRORS.sitting_closed)
    },
  )

  it.each(['scheduled', 'open'])('refuses a %s sitting whose UTC day has ended', (status) => {
    expect(sittingEmailRefusal(status, PAST)).toBe(SITTING_RPC_ERRORS.sitting_day_ended)
  })

  it.each(['scheduled', 'open'])('allows a %s sitting that has not ended', (status) => {
    expect(sittingEmailRefusal(status, FUTURE)).toBeNull()
  })

  it('allows a sitting scheduled for later today (UTC)', () => {
    expect(sittingEmailRefusal('open', new Date().toISOString())).toBeNull()
  })
})
