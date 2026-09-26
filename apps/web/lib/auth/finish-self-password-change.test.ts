import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockClearTempPassword, mockRecordAuthEvent } = vi.hoisted(() => ({
  mockClearTempPassword: vi.fn(),
  mockRecordAuthEvent: vi.fn(),
}))

vi.mock('./temp-password-admin', () => ({
  clearTempPassword: (...args: unknown[]) => mockClearTempPassword(...args),
}))

vi.mock('@/lib/audit/record-auth-event', () => ({
  recordAuthEvent: (...args: unknown[]) => mockRecordAuthEvent(...args),
}))

// ---- Subject under test -----------------------------------------------------

import { clearTempFlagAndAudit } from './finish-self-password-change'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000009'
const EXPIRY = '2026-09-25T00:00:00.000Z'
const supabase = {} as Parameters<typeof clearTempFlagAndAudit>[0]

beforeEach(() => {
  vi.resetAllMocks()
  mockClearTempPassword.mockResolvedValue({ success: true })
  mockRecordAuthEvent.mockResolvedValue(undefined)
})

describe('clearTempFlagAndAudit', () => {
  it('clears the flag with the given expiry and audits the change', async () => {
    const result = await clearTempFlagAndAudit(supabase, {
      userId: USER_ID,
      tempPasswordExpiresAt: EXPIRY,
      context: 'setOwnPassword',
    })

    expect(result).toBe(true)
    expect(mockClearTempPassword).toHaveBeenCalledWith(USER_ID, EXPIRY)
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(supabase, {
      eventType: 'user.password_changed',
      resourceId: USER_ID,
      context: 'setOwnPassword',
    })
  })

  it('skips the clear, still audits, and reports cleared when there was no active expiry', async () => {
    const result = await clearTempFlagAndAudit(supabase, {
      userId: USER_ID,
      tempPasswordExpiresAt: null,
      context: 'changePassword',
    })

    expect(result).toBe(true)
    expect(mockClearTempPassword).not.toHaveBeenCalled()
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(supabase, {
      eventType: 'user.password_changed',
      resourceId: USER_ID,
      context: 'changePassword',
    })
  })

  it('still audits and reports not cleared when the clear fails', async () => {
    mockClearTempPassword.mockResolvedValue({ success: false })

    const result = await clearTempFlagAndAudit(supabase, {
      userId: USER_ID,
      tempPasswordExpiresAt: EXPIRY,
      context: 'resetOwnPassword',
    })

    expect(result).toBe(false)
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(supabase, {
      eventType: 'user.password_changed',
      resourceId: USER_ID,
      context: 'resetOwnPassword',
    })
  })
})
