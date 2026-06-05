import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoist mock factories so they are available before module imports
const { mockSentryInit, mockCaptureRequestError, mockServerConfigImport, mockEdgeConfigImport } =
  vi.hoisted(() => ({
    mockSentryInit: vi.fn(),
    mockCaptureRequestError: vi.fn(),
    mockServerConfigImport: vi.fn(),
    mockEdgeConfigImport: vi.fn(),
  }))

vi.mock('@sentry/nextjs', () => ({
  init: mockSentryInit,
  captureRequestError: mockCaptureRequestError,
}))

// Dynamic imports of the Sentry config files are mocked so they don't
// execute real Sentry.init() calls during the test.
vi.mock('./sentry.server.config', () => {
  mockServerConfigImport()
  return {}
})
vi.mock('./sentry.edge.config', () => {
  mockEdgeConfigImport()
  return {}
})

describe('instrumentation', () => {
  const originalNextRuntime = process.env.NEXT_RUNTIME

  beforeEach(() => {
    vi.clearAllMocks()
  })

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
      expect(mockServerConfigImport).toHaveBeenCalledOnce()
      expect(mockEdgeConfigImport).not.toHaveBeenCalled()
    })

    it('imports the edge Sentry config when NEXT_RUNTIME is edge', async () => {
      process.env.NEXT_RUNTIME = 'edge'
      const { register } = await import('./instrumentation')
      await register()
      expect(mockEdgeConfigImport).toHaveBeenCalledOnce()
      expect(mockServerConfigImport).not.toHaveBeenCalled()
    })

    it('imports neither config when NEXT_RUNTIME is unset', async () => {
      delete process.env.NEXT_RUNTIME
      const { register } = await import('./instrumentation')
      await register()
      expect(mockServerConfigImport).not.toHaveBeenCalled()
      expect(mockEdgeConfigImport).not.toHaveBeenCalled()
    })

    it('imports neither config when NEXT_RUNTIME is an unrecognised value', async () => {
      process.env.NEXT_RUNTIME = 'browser'
      const { register } = await import('./instrumentation')
      await register()
      expect(mockServerConfigImport).not.toHaveBeenCalled()
      expect(mockEdgeConfigImport).not.toHaveBeenCalled()
    })
  })

  describe('onRequestError', () => {
    it('is exported and equals Sentry.captureRequestError', async () => {
      const { onRequestError } = await import('./instrumentation')
      expect(onRequestError).toBe(mockCaptureRequestError)
    })
  })
})
