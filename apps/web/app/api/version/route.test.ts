import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

describe('GET /api/version', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the deployment id from the environment', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_abc')
    const res = GET()
    expect(await res.json()).toEqual({ version: 'dpl_abc' })
  })

  it('returns a null version when no deployment id is set', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', undefined)
    const res = GET()
    expect(await res.json()).toEqual({ version: null })
  })

  it('disables caching of the response', () => {
    expect(GET().headers.get('Cache-Control')).toBe('no-store')
  })
})
