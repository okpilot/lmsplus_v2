import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBuildJwks } from './build-jwks'

describe('parseBuildJwks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the key set for a valid JWKS string', () => {
    const jwks = { keys: [{ kid: 'k1', kty: 'EC' }] }
    expect(parseBuildJwks(JSON.stringify(jwks))).toEqual(jwks)
  })

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['invalid JSON', '{nope'],
    ['a non-array keys', '{"keys":"x"}'],
    ['a null document', 'null'],
    ['a key without a kid', '{"keys":[{"kty":"EC"}]}'],
    ['a non-object key', '{"keys":["x"]}'],
    ['a key without a kty', '{"keys":[{"kid":"k1"}]}'],
    ['an empty key set', '{"keys":[]}'],
  ])('returns undefined for %s', (_label, raw) => {
    expect(parseBuildJwks(raw)).toBeUndefined()
  })

  it('logs an error when a non-empty value is rejected', () => {
    parseBuildJwks('{"keys":[]}')
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
  ])('logs nothing for %s', (_label, raw) => {
    parseBuildJwks(raw)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('exposes the key set from SUPABASE_BUILD_JWKS at module load', async () => {
    vi.stubEnv('SUPABASE_BUILD_JWKS', '{"keys":[{"kid":"a","kty":"EC"}]}')
    vi.resetModules()
    const mod = await import('./build-jwks')
    expect(mod.BUILD_JWKS).toEqual({ keys: [{ kid: 'a', kty: 'EC' }] })
  })
})
