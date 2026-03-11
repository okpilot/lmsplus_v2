/**
 * Tests for next.config.ts — CSP header construction.
 *
 * The `isDev` constant is evaluated at module load time, so each branch
 * requires a fresh module import after setting NODE_ENV via vi.stubEnv +
 * vi.resetModules().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Helper: load next.config.ts fresh after NODE_ENV and optional env vars have been set.
async function loadConfig(nodeEnv: string, extraEnv: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', nodeEnv)
  for (const [key, value] of Object.entries(extraEnv)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  // Dynamic import picks up the freshly-reset module registry.
  const mod = await import('./next.config')
  return mod.default
}

function extractCsp(headers: { key: string; value: string }[]): string {
  const entry = headers.find((h) => h.key === 'Content-Security-Policy')
  if (!entry) throw new Error('CSP header not found')
  return entry.value
}

async function getHeaderGroups(nodeEnv: string, extraEnv: Record<string, string> = {}) {
  const config = await loadConfig(nodeEnv, extraEnv)
  if (!config.headers) throw new Error('headers() not defined on config')
  return config.headers()
}

async function getCspForEnv(
  nodeEnv: string,
  extraEnv: Record<string, string> = {},
): Promise<string> {
  const headerGroups = await getHeaderGroups(nodeEnv, extraEnv)
  const group = headerGroups.find((g: { source: string }) => g.source === '/(.*)')
  if (!group) throw new Error('Header group not found')
  return extractCsp(group.headers)
}

describe('next.config — security headers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe('CSP in production', () => {
    it('omits unsafe-eval from script-src', async () => {
      const csp = await getCspForEnv('production')
      expect(csp).toContain("script-src 'self' 'unsafe-inline'")
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('omits localhost and 127.0.0.1 from img-src', async () => {
      const csp = await getCspForEnv('production')
      expect(csp).toContain("img-src 'self' data: blob: https://*.supabase.co")
      expect(csp).not.toContain('http://localhost:*')
      expect(csp).not.toContain('http://127.0.0.1:*')
    })

    it('omits localhost and 127.0.0.1 from connect-src', async () => {
      const csp = await getCspForEnv('production')
      expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
      expect(csp).not.toContain('http://localhost:*')
      expect(csp).not.toContain('http://127.0.0.1:*')
    })

    it('keeps static directives unchanged', async () => {
      const csp = await getCspForEnv('production')
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
    })
  })

  describe('CSP in development', () => {
    // unsafe-eval is required in dev for Next.js Fast Refresh / React DevTools.
    // Production CSP omits it — see the "CSP in production" suite above.
    it('includes unsafe-eval in script-src (required for Fast Refresh)', async () => {
      const csp = await getCspForEnv('development')
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    })

    it('includes localhost and 127.0.0.1 in img-src', async () => {
      const csp = await getCspForEnv('development')
      expect(csp).toContain('http://localhost:*')
      expect(csp).toContain('http://127.0.0.1:*')
    })

    it('includes localhost and 127.0.0.1 in connect-src', async () => {
      const csp = await getCspForEnv('development')
      expect(csp).toContain('http://localhost:*')
      expect(csp).toContain('http://127.0.0.1:*')
      expect(csp).toContain('ws://localhost:*')
    })

    it('keeps static directives unchanged', async () => {
      const csp = await getCspForEnv('development')
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
    })
  })

  describe('CSP in production with local Supabase URL (E2E CI)', () => {
    // When NEXT_PUBLIC_SUPABASE_URL starts with http://localhost, production builds
    // targeting a local Supabase instance (e.g., E2E CI) must allow localhost in CSP.
    // This is controlled by the `allowLocal` flag: isDev || isLocalSupabase.

    it('includes localhost and 127.0.0.1 in img-src when Supabase URL is localhost', async () => {
      const csp = await getCspForEnv('production', {
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      })
      expect(csp).toContain('http://localhost:*')
      expect(csp).toContain('http://127.0.0.1:*')
    })

    it('includes localhost and 127.0.0.1 in connect-src when Supabase URL is localhost', async () => {
      const csp = await getCspForEnv('production', {
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      })
      expect(csp).toContain('http://localhost:*')
      expect(csp).toContain('http://127.0.0.1:*')
      expect(csp).toContain('ws://localhost:*')
    })

    it('omits localhost from img-src when Supabase URL is a remote https URL', async () => {
      const csp = await getCspForEnv('production', {
        NEXT_PUBLIC_SUPABASE_URL: 'https://uepvblipahxizozxvwjn.supabase.co',
      })
      expect(csp).not.toContain('http://localhost:*')
      expect(csp).not.toContain('http://127.0.0.1:*')
    })

    it('omits localhost from connect-src when Supabase URL is a remote https URL', async () => {
      const csp = await getCspForEnv('production', {
        NEXT_PUBLIC_SUPABASE_URL: 'https://uepvblipahxizozxvwjn.supabase.co',
      })
      expect(csp).not.toContain('http://localhost:*')
      expect(csp).not.toContain('ws://localhost:*')
    })

    it('omits localhost from img-src when NEXT_PUBLIC_SUPABASE_URL is not set', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = undefined as unknown as string
      const csp = await getCspForEnv('production')
      expect(csp).not.toContain('http://localhost:*')
      expect(csp).not.toContain('http://127.0.0.1:*')
    })

    it('omits localhost from connect-src when NEXT_PUBLIC_SUPABASE_URL is not set', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = undefined as unknown as string
      const csp = await getCspForEnv('production')
      expect(csp).not.toContain('http://localhost:*')
      expect(csp).not.toContain('ws://localhost:*')
    })
  })

  describe('headers() structure', () => {
    it('applies to all routes via /(.*) pattern', async () => {
      const groups = await getHeaderGroups('production')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.source).toBe('/(.*)')
    })

    it('includes all seven security headers', async () => {
      const groups = await getHeaderGroups('production')
      const keys = groups[0]?.headers.map((h: { key: string }) => h.key)
      expect(keys).toContain('X-DNS-Prefetch-Control')
      expect(keys).toContain('X-Frame-Options')
      expect(keys).toContain('X-Content-Type-Options')
      expect(keys).toContain('Referrer-Policy')
      expect(keys).toContain('Permissions-Policy')
      expect(keys).toContain('Strict-Transport-Security')
      expect(keys).toContain('Content-Security-Policy')
    })

    it('HSTS value includes preload and 2-year max-age', async () => {
      const groups = await getHeaderGroups('production')
      const hsts = groups[0]?.headers.find(
        (h: { key: string }) => h.key === 'Strict-Transport-Security',
      )
      expect(hsts?.value).toBe('max-age=63072000; includeSubDomains; preload')
    })

    it('X-Frame-Options is SAMEORIGIN', async () => {
      const groups = await getHeaderGroups('production')
      const xfo = groups[0]?.headers.find((h: { key: string }) => h.key === 'X-Frame-Options')
      expect(xfo?.value).toBe('SAMEORIGIN')
    })
  })
})
