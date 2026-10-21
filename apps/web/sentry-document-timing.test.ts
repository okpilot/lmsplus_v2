import * as SentryCore from '@sentry/nextjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { documentTimingAttributes, recordDocumentTiming } from './sentry-document-timing'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  spanToJSON: vi.fn(),
}))

const asEntry = (v: Record<string, unknown>) => v as unknown as PerformanceNavigationTiming

describe('document timing attributes', () => {
  it('reports sizes, protocol and delivery type of the navigation entry', () => {
    const attrs = documentTimingAttributes(
      asEntry({
        transferSize: 5200,
        encodedBodySize: 4800,
        decodedBodySize: 21000,
        nextHopProtocol: 'h2',
        deliveryType: 'cache',
      }),
    )
    expect(attrs).toEqual({
      'document.transfer_size': 5200,
      'document.encoded_body_size': 4800,
      'document.decoded_body_size': 21000,
      'document.next_hop_protocol': 'h2',
      'document.delivery_type': 'cache',
    })
  })

  it('omits absent, negative, non-finite and empty values', () => {
    const attrs = documentTimingAttributes(
      asEntry({
        transferSize: -1,
        encodedBodySize: Number.NaN,
        decodedBodySize: 0,
        nextHopProtocol: '',
      }),
    )
    expect(attrs).toEqual({ 'document.decoded_body_size': 0 })
  })

  it('returns nothing when the browser has no navigation entry', () => {
    expect(documentTimingAttributes(undefined)).toEqual({})
  })
})

describe('recording document timing on the pageload span', () => {
  const setAttributes = vi.fn()
  const on = vi.fn()
  const span = { setAttributes } as unknown as SentryCore.Span
  const entry = { transferSize: 100, nextHopProtocol: 'h2' }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([entry as never])
  })

  function fire(op: string) {
    vi.mocked(SentryCore.spanToJSON).mockReturnValue({ attributes: { 'sentry.op': op } } as never)
    recordDocumentTiming({ on } as never)
    const cb = on.mock.calls[0]?.[1] as (s: SentryCore.Span) => void
    expect(on.mock.calls[0]?.[0]).toBe('beforeIdleSpanEnd')
    cb(span)
  }

  it('adds the attributes to a pageload span', () => {
    fire('pageload')
    expect(setAttributes).toHaveBeenCalledWith({
      'document.transfer_size': 100,
      'document.next_hop_protocol': 'h2',
    })
  })

  it('leaves a navigation span untouched', () => {
    fire('navigation')
    expect(setAttributes).not.toHaveBeenCalled()
  })

  it('does nothing when there is no client', () => {
    expect(() => recordDocumentTiming(undefined)).not.toThrow()
  })
})
