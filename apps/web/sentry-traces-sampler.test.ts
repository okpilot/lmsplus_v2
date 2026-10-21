import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_DOCUMENT_SAMPLE_RATE,
  clientTracesSampler,
  tracesSampler,
} from './sentry-traces-sampler'

type Ctx = Parameters<typeof tracesSampler>[0]

function ctx(over: {
  attributes?: Record<string, unknown>
  parentSampled?: boolean
  normalizedRequest?: unknown
}): Ctx {
  const parentSampled = over.parentSampled
  return {
    name: 'x',
    attributes: over.attributes ?? {},
    parentSampled,
    normalizedRequest: over.normalizedRequest,
    inheritOrSampleWith: (fallback: number) =>
      parentSampled === undefined ? fallback : Number(parentSampled),
  } as unknown as Ctx
}

const doc = (method: string, target: string) =>
  ctx({ attributes: { 'http.method': method, 'http.target': target } })

describe('server trace sampling', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps every /app document request', () => {
    expect(tracesSampler(doc('GET', '/app/dashboard'))).toBe(APP_DOCUMENT_SAMPLE_RATE)
    expect(tracesSampler(doc('GET', '/app'))).toBe(APP_DOCUMENT_SAMPLE_RATE)
    expect(tracesSampler(doc('GET', '/app/quiz?x=1'))).toBe(APP_DOCUMENT_SAMPLE_RATE)
  })

  it('samples /app RSC fetches at the default rate', () => {
    expect(tracesSampler(doc('GET', '/app/dashboard?_rsc=abc'))).toBe(0.1)
  })

  it('samples Server Action POSTs at the default rate', () => {
    expect(tracesSampler(doc('POST', '/app/dashboard'))).toBe(0.1)
  })

  it.each(['/', '/application', '/auth/login', '/api/app'])(
    'samples %s at the default rate',
    (path) => {
      expect(tracesSampler(doc('GET', path))).toBe(0.1)
    },
  )

  it('reads the request from the normalized request when attributes lack it', () => {
    const c = ctx({ normalizedRequest: { method: 'GET', url: 'https://x.test/app/dashboard' } })
    expect(tracesSampler(c)).toBe(APP_DOCUMENT_SAMPLE_RATE)
  })

  it('follows the parent trace decision either way', () => {
    const attributes = { 'http.method': 'GET', 'http.target': '/app/dashboard' }
    expect(tracesSampler(ctx({ attributes, parentSampled: false }))).toBe(0)
    expect(
      tracesSampler(
        ctx({ attributes: { 'http.method': 'GET', 'http.target': '/' }, parentSampled: true }),
      ),
    ).toBe(1)
  })

  it('keeps every trace in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(tracesSampler(doc('GET', '/'))).toBe(1)
  })
})

describe('browser trace sampling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const at = (pathname: string) => vi.stubGlobal('location', { pathname })
  const op = (o: string, parentSampled?: boolean) =>
    ctx({ attributes: { 'sentry.op': o }, parentSampled })

  it('keeps every /app pageload', () => {
    at('/app/dashboard')
    expect(clientTracesSampler(op('pageload'))).toBe(APP_DOCUMENT_SAMPLE_RATE)
  })

  it('samples /app navigations at the default rate', () => {
    at('/app/dashboard')
    expect(clientTracesSampler(op('navigation'))).toBe(0.1)
  })

  it('samples pageloads outside /app at the default rate', () => {
    at('/auth/login')
    expect(clientTracesSampler(op('pageload'))).toBe(0.1)
    at('/application')
    expect(clientTracesSampler(op('pageload'))).toBe(0.1)
  })

  it('follows the parent trace decision from the server', () => {
    at('/app/dashboard')
    expect(clientTracesSampler(op('pageload', false))).toBe(0)
  })

  it('keeps every trace in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    at('/')
    expect(clientTracesSampler(op('navigation'))).toBe(1)
  })
})
