import { describe, expect, it, vi } from 'vitest'

const mockIsRedirectError = vi.hoisted(() => vi.fn())

vi.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: mockIsRedirectError,
}))

import { rethrowRedirect } from './rethrow-redirect'

describe('rethrowRedirect', () => {
  it('re-throws when the error is a redirect error', () => {
    const redirectError = new Error('NEXT_REDIRECT:/auth/login')
    mockIsRedirectError.mockReturnValue(true)

    expect(() => rethrowRedirect(redirectError)).toThrow('NEXT_REDIRECT:/auth/login')
  })

  it('does not throw when the error is a regular error', () => {
    const regularError = new Error('DB timeout')
    mockIsRedirectError.mockReturnValue(false)

    expect(() => rethrowRedirect(regularError)).not.toThrow()
  })
})
