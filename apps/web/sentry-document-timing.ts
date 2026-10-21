import { type getClient, type Span, spanToJSON } from '@sentry/nextjs'

type SentryClient = ReturnType<typeof getClient>

type Attributes = Record<string, string | number>

const NUMERIC: ReadonlyArray<readonly [string, string]> = [
  ['transferSize', 'document.transfer_size'],
  ['encodedBodySize', 'document.encoded_body_size'],
  ['decodedBodySize', 'document.decoded_body_size'],
]

const TEXT: ReadonlyArray<readonly [string, string]> = [
  ['nextHopProtocol', 'document.next_hop_protocol'],
  ['deliveryType', 'document.delivery_type'],
]

/** Document size and protocol of the navigation entry; request/response durations and TTFB are already emitted by Sentry. */
export function documentTimingAttributes(
  entry: PerformanceNavigationTiming | undefined,
): Attributes {
  const attrs: Attributes = {}
  if (!entry) return attrs
  for (const [field, key] of NUMERIC) {
    const value: unknown = Reflect.get(entry, field)
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) attrs[key] = value
  }
  for (const [field, key] of TEXT) {
    const value: unknown = Reflect.get(entry, field)
    if (typeof value === 'string' && value !== '') attrs[key] = value
  }
  return attrs
}

function spanOp(span: Span): unknown {
  const json: unknown = spanToJSON(span)
  if (typeof json !== 'object' || json === null) return undefined
  if ('op' in json) return json.op
  return 'attributes' in json && typeof json.attributes === 'object' && json.attributes !== null
    ? Reflect.get(json.attributes, 'sentry.op')
    : undefined
}

export function recordDocumentTiming(client: SentryClient): void {
  client?.on('beforeIdleSpanEnd', (span: Span) => {
    if (spanOp(span) !== 'pageload') return
    const [entry] = performance.getEntriesByType('navigation')
    span.setAttributes(documentTimingAttributes(entry as PerformanceNavigationTiming | undefined))
  })
}
