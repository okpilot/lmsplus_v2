import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * admin.ts runs its browser-guard and env-var guard at module evaluation time,
 * not inside exported functions. Each test must use vi.resetModules() and a
 * fresh dynamic import so the module code re-executes with the current environment.
 */

const SUPABASE_URL = 'https://test.supabase.co'
const SERVICE_ROLE_KEY = 'test-service-role-key'

// Stub out the actual Supabase client so tests don't make network calls
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({ from: vi.fn() }),
}))

beforeEach(() => {
  vi.resetModules()
  // Ensure window is not defined (server-side context) by default
  vi.stubGlobal('window', undefined)
  // Provide valid env vars by default
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('admin client', () => {
  describe('browser guard', () => {
    it('throws TypeError when imported in a browser environment (window is defined)', async () => {
      vi.stubGlobal('window', {})
      await expect(import('./admin.js')).rejects.toThrow(TypeError)
    })

    it('throws with the expected message when window is defined', async () => {
      vi.stubGlobal('window', {})
      await expect(import('./admin.js')).rejects.toThrow(
        'admin client must not be used in the browser',
      )
    })

    it('does not throw when window is undefined (server-side context)', async () => {
      vi.stubGlobal('window', undefined)
      await expect(import('./admin.js')).resolves.toBeDefined()
    })
  })

  describe('env var guard', () => {
    it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
      await expect(import('./admin.js')).rejects.toThrow('Missing Supabase env vars')
    })

    it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
      await expect(import('./admin.js')).rejects.toThrow('Missing Supabase env vars')
    })

    it('exports adminClient when both env vars are present', async () => {
      const mod = await import('./admin.js')
      expect(mod.adminClient).toBeDefined()
    })
  })
})
