import { describe, expect, it, vi } from 'vitest'
import { createMockRouter } from './mock-router'

describe('createMockRouter', () => {
  it('provides vitest mock functions for every router method by default', () => {
    const router = createMockRouter()

    expect(vi.isMockFunction(router.back)).toBe(true)
    expect(vi.isMockFunction(router.forward)).toBe(true)
    expect(vi.isMockFunction(router.refresh)).toBe(true)
    expect(vi.isMockFunction(router.push)).toBe(true)
    expect(vi.isMockFunction(router.replace)).toBe(true)
    expect(vi.isMockFunction(router.prefetch)).toBe(true)
  })

  it('uses the exact function reference passed as an override', () => {
    const customPush = vi.fn()

    const router = createMockRouter({ push: customPush })

    expect(router.push).toBe(customPush)
  })

  it('keeps the default implementation for members not included in the override', () => {
    const customPush = vi.fn()

    const router = createMockRouter({ push: customPush })

    expect(vi.isMockFunction(router.replace)).toBe(true)
    expect(router.replace).not.toBe(customPush)
    expect(router.bfcacheId).toBe('mock-bfcache-id')
  })

  it('uses the caller-supplied bfcache id when one is given', () => {
    const router = createMockRouter({ bfcacheId: 'custom-bfcache-id' })

    expect(router.bfcacheId).toBe('custom-bfcache-id')
  })

  it('tracks calls independently across separate instances', () => {
    const routerA = createMockRouter()
    const routerB = createMockRouter()

    routerA.push('/a')

    routerA.replace('/b')
    routerA.refresh()
    routerA.back()
    routerA.forward()
    routerA.prefetch('/c')

    expect(routerA.push).toHaveBeenCalledTimes(1)
    expect(routerA.push).toHaveBeenCalledWith('/a')
    expect(routerA.replace).toHaveBeenCalledWith('/b')
    expect(routerA.prefetch).toHaveBeenCalledWith('/c')

    // A shared/module-scoped factory would leak every one of these into routerB.
    expect(routerB.push).not.toHaveBeenCalled()
    expect(routerB.replace).not.toHaveBeenCalled()
    expect(routerB.refresh).not.toHaveBeenCalled()
    expect(routerB.back).not.toHaveBeenCalled()
    expect(routerB.forward).not.toHaveBeenCalled()
    expect(routerB.prefetch).not.toHaveBeenCalled()
  })
})
