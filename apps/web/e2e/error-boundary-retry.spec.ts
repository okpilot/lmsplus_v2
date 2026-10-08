import { expect, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

type CutWindow = Window & { __cutDashboardStream?: boolean; __cutCount?: number }

const ERROR_TEXT = 'An unexpected error occurred.'

test.describe('Failed soft navigation to the dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Fault injection: while armed, a non-prefetch dashboard RSC response is cut mid-stream.
    await page.addInitScript(() => {
      const w = window as unknown as CutWindow
      const origFetch = window.fetch.bind(window)
      const isPrefetch = (input: RequestInfo | URL, init?: RequestInit): boolean => {
        const sources: unknown[] = [init?.headers, input instanceof Request ? input.headers : null]
        for (const h of sources) {
          if (!h) continue
          if (h instanceof Headers) {
            if (h.has('next-router-prefetch')) return true
          } else if (Array.isArray(h)) {
            if (h.some((e) => String(e[0]).toLowerCase() === 'next-router-prefetch')) return true
          } else if (
            Object.keys(h as Record<string, unknown>).some(
              (k) => k.toLowerCase() === 'next-router-prefetch',
            )
          ) {
            return true
          }
        }
        return false
      }
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await origFetch(input, init)
        const url = input instanceof Request ? input.url : String(input)
        if (
          w.__cutDashboardStream !== true ||
          !url.includes('/app/dashboard') ||
          !url.includes('_rsc') ||
          isPrefetch(input, init)
        ) {
          return res
        }
        w.__cutCount = (w.__cutCount || 0) + 1
        const buf = new Uint8Array(await res.arrayBuffer())
        let cut = Math.floor(buf.length * 0.6)
        while (cut < buf.length && buf[cut] !== 10) cut++
        if (cut >= buf.length) return res
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(buf.slice(0, cut + 1))
            setTimeout(() => controller.error(new TypeError('Load failed')), 1000)
          },
        })
        return new Response(body, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        })
      }
    })
  })

  test('Try again refetches the page after a failed navigation and shows the dashboard', async ({
    page,
  }) => {
    await page.goto('/app/quiz')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      ;(window as unknown as CutWindow).__cutDashboardStream = true
    })
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Dashboard' })
      .click()

    await expect(page.getByText(ERROR_TEXT)).toBeVisible({ timeout: 15_000 })
    expect(await page.evaluate(() => (window as unknown as CutWindow).__cutCount)).toBe(1)

    await page.evaluate(() => {
      ;(window as unknown as CutWindow).__cutDashboardStream = false
    })
    const refetch = page.waitForRequest(
      (r) =>
        r.url().includes('/app/dashboard') &&
        r.url().includes('_rsc') &&
        !r.headers()['next-router-prefetch'],
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: 'Try again' }).click()
    await refetch

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByText(ERROR_TEXT)).toHaveCount(0)
  })
})
