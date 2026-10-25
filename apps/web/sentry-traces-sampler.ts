import type { BrowserOptions } from '@sentry/nextjs'

type TracesSamplerSamplingContext = Parameters<NonNullable<BrowserOptions['tracesSampler']>>[0]

const DEFAULT_SAMPLE_RATE = 0.1

/** TEMPORARY (#1590, Decision 137): the rate for /app document requests and pageloads with no parent trace decision. Revert to DEFAULT_SAMPLE_RATE when #1590 posts its split. */
export const APP_DOCUMENT_SAMPLE_RATE = 1

const isAppPath = (path: string) => path === '/app' || path.startsWith('/app/')

type RequestParts = { method?: string; target?: string }

function requestParts(ctx: TracesSamplerSamplingContext): RequestParts {
  const attrs = ctx.attributes ?? {}
  const method = attrs['http.method'] ?? ctx.normalizedRequest?.method
  const target = attrs['http.target'] ?? ctx.normalizedRequest?.url
  return {
    method: typeof method === 'string' ? method.toUpperCase() : undefined,
    target: typeof target === 'string' ? target : undefined,
  }
}

// RSC requests carry `_rsc`; Next 307s an `rsc` request without a matching one (next/dist/server/base-server.js).
function isAppDocumentRequest(ctx: TracesSamplerSamplingContext): boolean {
  const { method, target } = requestParts(ctx)
  if (method !== 'GET' || !target) return false
  try {
    const url = new URL(target, 'http://localhost')
    return isAppPath(url.pathname) && !url.searchParams.has('_rsc')
  } catch {
    return false
  }
}

export function tracesSampler(ctx: TracesSamplerSamplingContext): number {
  return ctx.inheritOrSampleWith(
    isAppDocumentRequest(ctx) ? APP_DOCUMENT_SAMPLE_RATE : DEFAULT_SAMPLE_RATE,
  )
}

export function clientTracesSampler(ctx: TracesSamplerSamplingContext): number {
  const isAppPageload =
    ctx.attributes?.['sentry.op'] === 'pageload' && isAppPath(window.location.pathname)
  return ctx.inheritOrSampleWith(isAppPageload ? APP_DOCUMENT_SAMPLE_RATE : DEFAULT_SAMPLE_RATE)
}
