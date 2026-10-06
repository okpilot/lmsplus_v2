import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPersistenceNavigation } from './build-persistence-navigation'

// ---- Fixtures ---------------------------------------------------------------

function makeOpts(overrides?: Partial<Parameters<typeof buildPersistenceNavigation>[0]>) {
  return {
    navigateTo: vi.fn(),
    getCurrentIndex: vi.fn(() => 0),
    clearAnswerError: vi.fn(),
    clearSubmitError: vi.fn(),
    ...overrides,
  }
}

// ---- Lifecycle ---------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- return shape -----------------------------------------------------------

describe('buildPersistenceNavigation — return shape', () => {
  it('returns wrapped navigateTo (not the original reference)', () => {
    const opts = makeOpts()
    const result = buildPersistenceNavigation(opts)
    expect(result.navigateTo).not.toBe(opts.navigateTo)
  })

  it('returns a navigate function', () => {
    const opts = makeOpts()
    const result = buildPersistenceNavigation(opts)
    expect(typeof result.navigate).toBe('function')
  })
})

// ---- wrappedNavigateTo — side effects before checkpoint ---------------------

describe('buildPersistenceNavigation — wrappedNavigateTo call ordering', () => {
  it('clears answer error before calling navigateTo', () => {
    const order: string[] = []
    const opts = makeOpts({
      clearAnswerError: vi.fn(() => {
        order.push('clearAnswerError')
      }),
      navigateTo: vi.fn(() => {
        order.push('navigateTo')
      }),
    })
    buildPersistenceNavigation(opts).navigateTo(2)
    expect(order.indexOf('clearAnswerError')).toBeLessThan(order.indexOf('navigateTo'))
  })

  it('clears submit error before calling navigateTo', () => {
    const order: string[] = []
    const opts = makeOpts({
      clearSubmitError: vi.fn(() => {
        order.push('clearSubmitError')
      }),
      navigateTo: vi.fn(() => {
        order.push('navigateTo')
      }),
    })
    buildPersistenceNavigation(opts).navigateTo(2)
    expect(order.indexOf('clearSubmitError')).toBeLessThan(order.indexOf('navigateTo'))
  })

  it('calls navigateTo with the target index', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(3)
    expect(opts.navigateTo).toHaveBeenCalledWith(3)
  })

  it('calls clearAnswerError exactly once per navigation', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(1)
    expect(opts.clearAnswerError).toHaveBeenCalledTimes(1)
  })

  it('calls clearSubmitError exactly once per navigation', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(1)
    expect(opts.clearSubmitError).toHaveBeenCalledTimes(1)
  })
})

describe('buildPersistenceNavigation — wrappedNavigate (relative)', () => {
  it('navigates to getCurrentIndex() + delta', () => {
    const opts = makeOpts({ getCurrentIndex: vi.fn(() => 3) })
    buildPersistenceNavigation(opts).navigate(2)
    expect(opts.navigateTo).toHaveBeenCalledWith(5)
  })

  it('navigates backwards with a negative delta', () => {
    const opts = makeOpts({ getCurrentIndex: vi.fn(() => 4) })
    buildPersistenceNavigation(opts).navigate(-1)
    expect(opts.navigateTo).toHaveBeenCalledWith(3)
  })

  it('calls clearAnswerError and clearSubmitError on relative navigation', () => {
    const opts = makeOpts({ getCurrentIndex: vi.fn(() => 0) })
    buildPersistenceNavigation(opts).navigate(1)
    expect(opts.clearAnswerError).toHaveBeenCalledTimes(1)
    expect(opts.clearSubmitError).toHaveBeenCalledTimes(1)
  })
})
