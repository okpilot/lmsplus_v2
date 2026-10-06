import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'

const { initSpy, replayIntegrationSpy, captureRouterTransitionStart } = vi.hoisted(() => ({
  initSpy: vi.fn(),
  replayIntegrationSpy: vi.fn(() => ({ name: 'Replay' })),
  captureRouterTransitionStart: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  init: initSpy,
  replayIntegration: replayIntegrationSpy,
  captureRouterTransitionStart,
}))

// @sentry/core 11.4.0 build/cjs/vendor/getIpAddress.js ipHeaderNames, plus Vercel's
// identifying and geolocation headers (vercel.com/docs/headers/request-headers).
const IDENTIFYING_HEADER_NAMES = [
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
  'x-vercel-ip-country',
  'x-vercel-ip-country-region',
  'x-vercel-ip-city',
  'x-vercel-ip-postal-code',
  'x-vercel-ip-latitude',
  'x-vercel-ip-longitude',
  'x-vercel-ip-timezone',
  'x-vercel-proxied-for',
  'x-vercel-ja4-digest',
]

describe('Sentry init options', () => {
  beforeEach(() => {
    vi.resetModules()
    initSpy.mockClear()
    replayIntegrationSpy.mockClear()
  })

  it.each([
    ['client', () => import('./instrumentation-client')],
    ['server', () => import('./sentry.server.config')],
    ['edge', () => import('./sentry.edge.config')],
  ])('%s config uses the shared data-collection policy', async (_name, load) => {
    await load()
    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dataCollection: SENTRY_DATA_COLLECTION }),
    )
  })

  it('browser config records a replay only for sessions that hit an error', async () => {
    await import('./instrumentation-client')
    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 }),
    )
  })

  it('browser replay masks all text and inputs and blocks media', async () => {
    await import('./instrumentation-client')
    expect(replayIntegrationSpy).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    })
  })

  it('browser config reports App Router navigations to Sentry', async () => {
    const mod = await import('./instrumentation-client')
    expect(mod.onRouterTransitionStart).toBe(captureRouterTransitionStart)
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

  it.each(IDENTIFYING_HEADER_NAMES)('drops the %s header', (header) => {
    const headers = SENTRY_DATA_COLLECTION.httpHeaders
    if (typeof headers !== 'object' || !('deny' in headers)) throw new Error('expected a deny list')
    expect(headers.deny.some((term) => header.toLowerCase().includes(term))).toBe(true)
  })
})
