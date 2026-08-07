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
    expect(typeof router.bfcacheId).toBe('string')
  })
})
