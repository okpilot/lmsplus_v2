// App-layer integration tier setup (#925).
//
// The whole point of this tier is that `createServerSupabaseClient()`
// (packages/db/src/server.ts) runs FOR REAL against local Postgres. Its only
// non-DB dependency is `next/headers` `cookies()`, so we replace that with an
// in-memory cookie jar: signing in once (via the harness `signInAs`) drives the
// real @supabase/ssr client to persist a real session into the jar, and every
// subsequent `createServerSupabaseClient()` reads the same jar — authenticated,
// under real RLS. No Supabase client, query helper, or RPC wrapper is mocked.
//
// `next/cache` + `next/navigation` are stubbed so Server Actions that call
// `revalidatePath`/`redirect` don't blow up in the node test env.
//
// The factory references a module-scoped function (hoisted) and keeps the jar on
// `globalThis`, so the `vi.mock` hoist has nothing to capture from imports.
import { beforeEach, vi } from 'vitest'

type CookieJar = Map<string, string>

function integrationCookieJar(): CookieJar {
  const g = globalThis as unknown as { __integrationCookieJar?: CookieJar }
  g.__integrationCookieJar ??= new Map()
  return g.__integrationCookieJar
}

vi.mock('next/headers', () => ({
  cookies: async () => {
    const jar = integrationCookieJar()
    return {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => {
        jar.set(name, value)
      },
      get: (name: string) => {
        const value = jar.get(name)
        return value === undefined ? undefined : { name, value }
      },
    }
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  // Next signals navigation by throwing; mirror that so a test can assert on it.
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

// Fresh jar before every test — no auth session bleeds between tests.
beforeEach(() => {
  ;(globalThis as unknown as { __integrationCookieJar?: CookieJar }).__integrationCookieJar =
    new Map()
})
