import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '@/lib/consent/versions'
import { buildConsentCookieValue, checkConsentStatus } from './check-consent'

function makeClient(opts: { rpcData?: unknown; rpcError?: { message: string } | null }) {
  const rpcFn = vi.fn().mockResolvedValue({
    data: opts.rpcData ?? null,
    error: opts.rpcError ?? null,
  })
  return { rpc: rpcFn }
}

describe('checkConsentStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns satisfied when both has_tos and has_privacy are true', async () => {
    const client = makeClient({ rpcData: [{ has_tos: true, has_privacy: true }] })
    const result = await checkConsentStatus(client as unknown as never)
    expect(result).toBe('satisfied')
  })

  it('returns required when has_tos is false', async () => {
    const client = makeClient({ rpcData: [{ has_tos: false, has_privacy: true }] })
    const result = await checkConsentStatus(client as unknown as never)
    expect(result).toBe('required')
  })

  it('returns required when has_privacy is false', async () => {
    const client = makeClient({ rpcData: [{ has_tos: true, has_privacy: false }] })
    const result = await checkConsentStatus(client as unknown as never)
    expect(result).toBe('required')
  })

  it('returns required when RPC returns empty array', async () => {
    const client = makeClient({ rpcData: [] })
    const result = await checkConsentStatus(client as unknown as never)
    expect(result).toBe('required')
  })

  it('returns required when RPC returns an error', async () => {
    const client = makeClient({ rpcData: null, rpcError: { message: 'DB error' } })
    const result = await checkConsentStatus(client as unknown as never)
    expect(result).toBe('required')
  })

  it('returns required when data is null', async () => {
    const client = makeClient({ rpcData: null, rpcError: null })
    const result = await checkConsentStatus(client as unknown as never)
    expect(result).toBe('required')
  })
})

describe('buildConsentCookieValue', () => {
  it('returns tos and privacy versions joined by a colon', () => {
    const value = buildConsentCookieValue()
    expect(value).toBe(`${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`)
  })
})
