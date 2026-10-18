import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetPasswordSubmit } from './use-set-password-submit'

const { mockSetPasswordFromLink, mockAssign } = vi.hoisted(() => ({
  mockSetPasswordFromLink: vi.fn(),
  mockAssign: vi.fn(),
}))

vi.mock('../actions', () => ({
  setPasswordFromLink: (...args: unknown[]) => mockSetPasswordFromLink(...args),
}))

Object.defineProperty(window, 'location', {
  configurable: true,
  value: { assign: mockAssign },
})

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const event = () => ({ preventDefault: vi.fn() }) as unknown as React.SubmitEvent<HTMLFormElement>

function setup(password = 'password123', confirm = 'password123') {
  const hook = renderHook(() => useSetPasswordSubmit(HASH))
  act(() => {
    hook.result.current.setPassword(password)
    hook.result.current.setConfirmPassword(confirm)
  })
  return hook
}

async function submit(hook: ReturnType<typeof setup>) {
  await act(async () => {
    await hook.result.current.handleSubmit(event())
  })
}

describe('useSetPasswordSubmit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a validation message and skips the action when passwords differ', async () => {
    const hook = setup('password123', 'different456')
    await submit(hook)

    expect(hook.result.current.error).toMatch(/passwords do not match/i)
    expect(mockSetPasswordFromLink).not.toHaveBeenCalled()
  })

  it('sends the user to login-complete after a successful update', async () => {
    mockSetPasswordFromLink.mockResolvedValue({ success: true, redirectTo: '/auth/login-complete' })
    const hook = setup()
    await submit(hook)

    expect(mockSetPasswordFromLink).toHaveBeenCalledWith({
      password: 'password123',
      confirmPassword: 'password123',
      tokenHash: HASH,
      type: 'recovery',
    })
    expect(mockAssign).toHaveBeenCalledWith('/auth/login-complete')
  })

  it('flags the link as invalid when the action reports linkInvalid', async () => {
    mockSetPasswordFromLink.mockResolvedValue({ success: false, error: 'bad', linkInvalid: true })
    const hook = setup()
    await submit(hook)

    expect(hook.result.current.linkInvalid).toBe(true)
  })

  it('offers a continue link and blocks resubmission when the failure carries a redirect', async () => {
    mockSetPasswordFromLink.mockResolvedValue({
      success: false,
      error: 'Saved, but sign-in failed',
      redirectTo: '/login',
    })
    const hook = setup()
    await submit(hook)

    expect(hook.result.current.continueTo).toBe('/login')
    expect(hook.result.current.error).toBe('Saved, but sign-in failed')

    await submit(hook)
    expect(mockSetPasswordFromLink).toHaveBeenCalledTimes(1)
  })

  it('allows a retry after a plain error message', async () => {
    mockSetPasswordFromLink.mockResolvedValue({ success: false, error: 'Nope' })
    const hook = setup()
    await submit(hook)

    expect(hook.result.current.error).toBe('Nope')
    expect(hook.result.current.continueTo).toBeNull()

    await submit(hook)
    expect(mockSetPasswordFromLink).toHaveBeenCalledTimes(2)
  })

  it('shows a generic message and allows a retry when the action throws', async () => {
    mockSetPasswordFromLink.mockRejectedValue(new Error('network'))
    const hook = setup()
    await submit(hook)

    expect(hook.result.current.error).toBe('Unable to update password. Please try again.')
    expect(hook.result.current.loading).toBe(false)

    await submit(hook)
    expect(mockSetPasswordFromLink).toHaveBeenCalledTimes(2)
  })
})
