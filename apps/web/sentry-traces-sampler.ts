import type { BrowserOptions } from '@sentry/nextjs'

type TracesSamplerSamplingContext = Parameters<NonNullable<BrowserOptions['tracesSampler']>>[0]

const DEFAULT_SAMPLE_RATE = 0.1

/** TEMPORARY (#1590, Decision 137): every /app document request and pageload is sampled. Revert to DEFAULT_SAMPLE_RATE when #1590 posts its split. */
export const APP_DOCUMENT_SAMPLE_RATE = 1

const isDevelopment = () => process.env.NODE_ENV === 'development'

const isAppPath = (path: string) => path === '/app' || path.startsWith('/app/')

type RequestParts = { method?: string; target?: string }

function requestParts(ctx: TracesSamplerSamplingContext): RequestParts {
  const attrs = ctx.attributes ?? {}
  const method =
    attrs['http.method'] ?? attrs['http.request.method'] ?? ctx.normalizedRequest?.method
  const target = attrs['http.target'] ?? ctx.normalizedRequest?.url
  return {
    method: typeof method === 'string' ? method.toUpperCase() : undefined,
    target: typeof target === 'string' ? target : undefined,
  }
}

function isAppDocumentRequest(ctx: TracesSamplerSamplingContext): boolean {
  const { method, target } = requestParts(ctx)
  if (method !== 'GET' || !target) return false
  const url = new URL(target, 'http://localhost')
  return isAppPath(url.pathname) && !url.searchParams.has('_rsc')
}

export function tracesSampler(ctx: TracesSamplerSamplingContext): number {
  if (isDevelopment()) return 1
  return ctx.inheritOrSampleWith(
    isAppDocumentRequest(ctx) ? APP_DOCUMENT_SAMPLE_RATE : DEFAULT_SAMPLE_RATE,
  )
}

export function clientTracesSampler(ctx: TracesSamplerSamplingContext): number {
  if (isDevelopment()) return 1
  const isAppPageload =
    ctx.attributes?.['sentry.op'] === 'pageload' && isAppPath(window.location.pathname)
  return ctx.inheritOrSampleWith(isAppPageload ? APP_DOCUMENT_SAMPLE_RATE : DEFAULT_SAMPLE_RATE)
}
