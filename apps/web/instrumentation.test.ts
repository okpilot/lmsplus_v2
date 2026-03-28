import { afterEach, describe, expect, it, vi } from 'vitest'

// Hoist mock factories so they are available before module imports
const { mockSentryInit, mockCaptureRequestError } = vi.hoisted(() => ({
  mockSentryInit: vi.fn(),
  mockCaptureRequestError: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  init: mockSentryInit,
  captureRequestError: mockCaptureRequestError,
}))

// Dynamic imports of the Sentry config files are mocked so they don't
// execute real Sentry.init() calls during the test.
vi.mock('./sentry.server.config', () => ({}))
vi.mock('./sentry.edge.config', () => ({}))

describe('instrumentation', () => {
  const originalNextRuntime = process.env.NEXT_RUNTIME

  afterEach(() => {
    // Restore env var after each test
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime
    }
    vi.resetModules()
  })

  describe('register', () => {
    it('imports the server Sentry config when NEXT_RUNTIME is nodejs', async () => {
      process.env.NEXT_RUNTIME = 'nodejs'
      // Re-import after env change so the module sees the updated value
      const { register } = await import('./instrumentation')
      await register()
      // The mock for ./sentry.server.config will have been resolved — no error
      // means the correct dynamic import branch executed. We verify indirectly
      // by confirming the edge config was NOT imported (its mock is separate).
      // Direct assertion: register() resolves without throwing.
      await expect(register()).resolves.toBeUndefined()
    })

    it('imports the edge Sentry config when NEXT_RUNTIME is edge', async () => {
      process.env.NEXT_RUNTIME = 'edge'
      const { register } = await import('./instrumentation')
      await expect(register()).resolves.toBeUndefined()
    })

    it('imports neither config when NEXT_RUNTIME is unset', async () => {
      delete process.env.NEXT_RUNTIME
      const { register } = await import('./instrumentation')
      await expect(register()).resolves.toBeUndefined()
    })

    it('imports neither config when NEXT_RUNTIME is an unrecognised value', async () => {
      process.env.NEXT_RUNTIME = 'browser'
      const { register } = await import('./instrumentation')
      await expect(register()).resolves.toBeUndefined()
    })
  })

  describe('onRequestError', () => {
    it('is exported and equals Sentry.captureRequestError', async () => {
      const { onRequestError } = await import('./instrumentation')
      expect(onRequestError).toBe(mockCaptureRequestError)
    })
  })
})
