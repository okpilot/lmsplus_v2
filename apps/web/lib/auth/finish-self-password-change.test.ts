import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClearMarker, mockRecordAuthEvent } = vi.hoisted(() => ({
  mockClearMarker: vi.fn(),
  mockRecordAuthEvent: vi.fn(),
}))

vi.mock('./password-pending-marker', () => ({
  clearPasswordPendingMarker: (...args: unknown[]) => mockClearMarker(...args),
}))

vi.mock('@/lib/audit/record-auth-event', () => ({
  recordAuthEvent: (...args: unknown[]) => mockRecordAuthEvent(...args),
}))

import { recordOwnPasswordSet } from './finish-self-password-change'

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000009'
const supabase = {} as Parameters<typeof recordOwnPasswordSet>[0]

beforeEach(() => {
  vi.resetAllMocks()
  mockClearMarker.mockResolvedValue(undefined)
  mockRecordAuthEvent.mockResolvedValue(undefined)
})

describe('recordOwnPasswordSet', () => {
  it('audits the password change under the caller context', async () => {
    await recordOwnPasswordSet(supabase, { userId: USER_ID, context: 'setPasswordFromLink' })

    expect(mockRecordAuthEvent).toHaveBeenCalledWith(supabase, {
      eventType: 'user.password_changed',
      resourceId: USER_ID,
      context: 'setPasswordFromLink',
    })
  })

  it('clears the pending-password marker for the user', async () => {
    await recordOwnPasswordSet(supabase, { userId: USER_ID, context: 'changePassword' })

    expect(mockClearMarker).toHaveBeenCalledWith(USER_ID)
  })

  it('audits before clearing the marker', async () => {
    const order: string[] = []
    mockRecordAuthEvent.mockImplementation(async () => {
      order.push('audit')
    })
    mockClearMarker.mockImplementation(async () => {
      order.push('clear')
    })

    await recordOwnPasswordSet(supabase, { userId: USER_ID, context: 'resetOwnPassword' })

    expect(order).toEqual(['audit', 'clear'])
  })
})
