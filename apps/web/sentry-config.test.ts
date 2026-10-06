import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'

const initSpy = vi.hoisted(() => vi.fn())

vi.mock('@sentry/nextjs', () => ({
  init: initSpy,
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
  captureRouterTransitionStart: vi.fn(),
}))

// @sentry/core 11.4.0 build/cjs/vendor/getIpAddress.js ipHeaderNames
const IP_HEADER_NAMES = [
  'X-Client-IP',
  'X-Forwarded-For',
  'Fly-Client-IP',
  'CF-Connecting-IP',
  'Fastly-Client-Ip',
  'True-Client-Ip',
  'X-Real-IP',
  'X-Cluster-Client-IP',
  'X-Forwarded',
  'Forwarded-For',
  'Forwarded',
  'X-Vercel-Forwarded-For',
]

describe('Sentry init options', () => {
  beforeEach(() => {
    vi.resetModules()
    initSpy.mockClear()
  })

  it.each([
    ['client', () => import('./sentry.client.config')],
    ['server', () => import('./sentry.server.config')],
    ['edge', () => import('./sentry.edge.config')],
  ])('%s config uses the shared data-collection policy', async (_name, load) => {
    await load()
    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dataCollection: SENTRY_DATA_COLLECTION }),
    )
  })
})

describe('Sentry data-collection policy', () => {
  it('sends no user IP or identity', () => {
    expect(SENTRY_DATA_COLLECTION.userInfo).toBe(false)
  })

  it('sends no cookies', () => {
    expect(SENTRY_DATA_COLLECTION.cookies).toBe(false)
  })

  it('never captures HTTP request or response bodies', () => {
    expect(SENTRY_DATA_COLLECTION.httpBodies).toEqual([])
  })

  it.each(IP_HEADER_NAMES)('drops the %s header', (header) => {
    const headers = SENTRY_DATA_COLLECTION.httpHeaders
    if (typeof headers !== 'object' || !('deny' in headers)) throw new Error('expected a deny list')
    expect(headers.deny.some((term) => header.toLowerCase().includes(term))).toBe(true)
  })
})
