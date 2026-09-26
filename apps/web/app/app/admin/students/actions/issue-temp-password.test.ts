import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockUpdateUserById = vi.hoisted(() => vi.fn())
const mockArmTempPassword = vi.hoisted(() => vi.fn())
const mockRestoreTempPasswordExpiry = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    auth: { admin: { updateUserById: mockUpdateUserById } },
  },
}))
vi.mock('@/lib/auth/temp-password-admin', () => ({
  armTempPassword: (...args: unknown[]) => mockArmTempPassword(...args),
  restoreTempPasswordExpiry: (...args: unknown[]) => mockRestoreTempPasswordExpiry(...args),
}))

// ---- Subject under test ------------------------------------------------------

import { issueTempPassword } from './issue-temp-password'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const PRIOR_EXPIRY = '2026-09-20T00:00:00.000Z'
const FIRST_ARM_EXPIRY = '2026-09-27T00:00:00.000Z'
const SECOND_ARM_EXPIRY = '2026-09-27T00:00:05.000Z'

const BASE_OPTS = {
  userId: USER_ID,
  organizationId: ORG_ID,
  password: 'NewPass1',
  priorExpiresAt: PRIOR_EXPIRY,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockArmTempPassword.mockResolvedValueOnce({ success: true, expiresAt: FIRST_ARM_EXPIRY })
  mockArmTempPassword.mockResolvedValueOnce({ success: true, expiresAt: SECOND_ARM_EXPIRY })
  mockUpdateUserById.mockResolvedValue({ error: null })
  mockRestoreTempPasswordExpiry.mockResolvedValue({ success: true })
})

describe('issueTempPassword', () => {
  it('does not write the Auth password when the first arm fails', async () => {
    mockArmTempPassword.mockReset()
    mockArmTempPassword.mockResolvedValue({ success: false })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const outcome = await issueTempPassword(BASE_OPTS)

    expect(outcome).toBe('failed')
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[resetStudentPassword] Failed to arm temp password before reset for user:',
      USER_ID,
    )
    consoleSpy.mockRestore()
  })

  it('rolls back the first arm via compare-and-set and reports failure when the Auth write fails', async () => {
    mockUpdateUserById.mockResolvedValue({ error: { message: 'update failed' } })

    const outcome = await issueTempPassword(BASE_OPTS)

    expect(outcome).toBe('failed')
    expect(mockRestoreTempPasswordExpiry).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      armedExpiresAt: FIRST_ARM_EXPIRY,
      priorExpiresAt: PRIOR_EXPIRY,
    })
    expect(mockArmTempPassword).toHaveBeenCalledTimes(1)
  })

  it('logs when the rollback restore also fails after a failed Auth write', async () => {
    mockUpdateUserById.mockResolvedValue({ error: { message: 'update failed' } })
    mockRestoreTempPasswordExpiry.mockResolvedValue({ success: false })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const outcome = await issueTempPassword(BASE_OPTS)

    expect(outcome).toBe('failed')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[resetStudentPassword] Rollback of temp-password expiry failed for user:',
      USER_ID,
    )
    consoleSpy.mockRestore()
  })

  it('arms, writes the Auth password, and re-arms in that order on success', async () => {
    const outcome = await issueTempPassword(BASE_OPTS)

    expect(outcome).toBe('issued')
    expect(mockArmTempPassword).toHaveBeenCalledTimes(2)

    const firstArmOrder = mockArmTempPassword.mock.invocationCallOrder[0]
    const updateOrder = mockUpdateUserById.mock.invocationCallOrder[0]
    const secondArmOrder = mockArmTempPassword.mock.invocationCallOrder[1]
    expect(firstArmOrder).toBeDefined()
    expect(updateOrder).toBeDefined()
    expect(secondArmOrder).toBeDefined()
    if (firstArmOrder === undefined || updateOrder === undefined || secondArmOrder === undefined) {
      return
    }
    expect(firstArmOrder).toBeLessThan(updateOrder)
    expect(updateOrder).toBeLessThan(secondArmOrder)
    expect(mockRestoreTempPasswordExpiry).not.toHaveBeenCalled()
  })

  it('reports issued_not_armed and logs when the second arm fails after a successful Auth write', async () => {
    mockArmTempPassword.mockReset()
    mockArmTempPassword.mockResolvedValueOnce({ success: true, expiresAt: FIRST_ARM_EXPIRY })
    mockArmTempPassword.mockResolvedValueOnce({ success: false })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const outcome = await issueTempPassword(BASE_OPTS)

    expect(outcome).toBe('issued_not_armed')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[resetStudentPassword] Password set but re-arm failed for user:',
      USER_ID,
    )
    expect(mockRestoreTempPasswordExpiry).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
