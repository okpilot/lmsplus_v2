// Covers: every admin page.tsx default export rejects with the admin-check error before rendering.
// Complements the static AST check in admin-pages-guard.test.ts.
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
// `@repo/db/admin` throws at module load when `window` exists (jsdom).
vi.mock('@repo/db/admin', () => ({ adminClient: { from: vi.fn() } }))

const ADMIN_DIR = __dirname
const SENTINEL = new Error('admin check failed')

function pageFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const own = entries
    .filter((e) => e.isFile() && e.name === 'page.tsx')
    .map((e) => join(dir, e.name))
  return own.concat(
    entries.filter((e) => e.isDirectory()).flatMap((e) => pageFiles(join(dir, e.name))),
  )
}

const pages = pageFiles(ADMIN_DIR)
  .sort()
  .map((abs) => [relative(ADMIN_DIR, abs), abs] as const)

type PageModule = {
  default: (props: { params: Promise<{ id: string }>; searchParams: Promise<object> }) => unknown
}

describe('admin pages runtime guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('discovers the admin pages including the root page', () => {
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.map(([rel]) => rel)).toContain('page.tsx')
  })

  // MUTATION: delete await requireAdmin() from a page → that page's case resolves or rejects with a different error
  it.each(pages)('%s rejects before rendering when the admin check fails', async (_rel, abs) => {
    mockRequireAdmin.mockRejectedValue(SENTINEL)
    const mod = (await import(/* @vite-ignore */ abs)) as PageModule

    await expect(
      Promise.resolve(
        mod.default({
          params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ).rejects.toBe(SENTINEL)
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1)
  })
})
