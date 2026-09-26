import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockGetRecipient = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockIssueAndEmailPassword = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../login-instructions-recipient', () => ({
  getLoginInstructionsRecipient: mockGetRecipient,
}))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: mockRpc }))
vi.mock('./deliver-login-instructions', () => ({
  issueAndEmailPassword: mockIssueAndEmailPassword,
}))

// ---- Subject under test -------------------------------------------------------

import { sendLoginInstructions } from './send-login-instructions'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const ORG_ID = 'org-001'
const SUPABASE = { __marker: 'supabase' }
const VALID_INPUT = { id: USER_ID }

const RECIPIENT = {
  email: 'alice@example.com',
  fullName: 'Alice',
  tempPasswordExpiresAt: null,
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: ORG_ID,
    userId: 'admin-001',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
})

describe('sendLoginInstructions', () => {
  it('rejects invalid input without calling requireAdmin', async () => {
    const result = await sendLoginInstructions({ id: 'not-a-uuid' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRequireAdmin).not.toHaveBeenCalled()
  })

  it('returns "User not found" when no recipient matches', async () => {
    mockAdmin()
    mockGetRecipient.mockResolvedValue(null)

    const result = await sendLoginInstructions(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'User not found' })
    expect(mockIssueAndEmailPassword).not.toHaveBeenCalled()
  })

  it('passes the admin user-context client through to delivery', async () => {
    mockAdmin()
    mockGetRecipient.mockResolvedValue(RECIPIENT)
    mockIssueAndEmailPassword.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: null })

    await sendLoginInstructions(VALID_INPUT)

    expect(mockIssueAndEmailPassword).toHaveBeenCalledWith({
      supabase: SUPABASE,
      id: USER_ID,
      organizationId: ORG_ID,
      recipient: RECIPIENT,
    })
  })

  it('fails without issuing a password when NEXT_PUBLIC_APP_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    mockAdmin()
    mockGetRecipient.mockResolvedValue(RECIPIENT)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendLoginInstructions(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to send login instructions' })
    expect(mockIssueAndEmailPassword).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[sendLoginInstructions] NEXT_PUBLIC_APP_URL is not set')
    errorSpy.mockRestore()
  })

  it('returns the delivery error and skips the record-sent RPC when delivery fails', async () => {
    mockAdmin()
    mockGetRecipient.mockResolvedValue(RECIPIENT)
    mockIssueAndEmailPassword.mockResolvedValue({
      ok: false,
      result: { success: false, error: 'Failed to send login instructions' },
    })

    const result = await sendLoginInstructions(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to send login instructions' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('records the send and revalidates on a fully delivered send', async () => {
    mockAdmin()
    mockGetRecipient.mockResolvedValue(RECIPIENT)
    mockIssueAndEmailPassword.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await sendLoginInstructions(VALID_INPUT)

    expect(result).toEqual({ success: true })
    expect(mockRpc).toHaveBeenCalledWith(SUPABASE, 'record_login_instructions_sent', {
      p_user_id: USER_ID,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
  })

  it('reports that the email went out but was not recorded when the record-sent RPC fails', async () => {
    mockAdmin()
    mockGetRecipient.mockResolvedValue(RECIPIENT)
    mockIssueAndEmailPassword.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendLoginInstructions(VALID_INPUT)

    expect(result).toEqual({
      success: false,
      error: 'Login instructions were emailed but the send could not be recorded.',
    })
    expect(errorSpy).toHaveBeenCalledWith(
      '[sendLoginInstructions] Record-sent RPC failed:',
      'rpc boom',
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    errorSpy.mockRestore()
  })
})
