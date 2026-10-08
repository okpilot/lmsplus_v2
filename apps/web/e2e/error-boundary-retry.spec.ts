import { expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

type CutWindow = Window & { __cutDashboardStream?: boolean; __cutCount?: number }

const ERROR_TEXT = 'An unexpected error occurred.'

/** Runs in the page: while armed, a non-prefetch dashboard RSC response is cut mid-stream. */
function installDashboardStreamCut() {
  const w = window as unknown as CutWindow
  const origFetch = window.fetch.bind(window)
  const isPrefetch = (input: RequestInfo | URL, init?: RequestInit): boolean =>
    new Headers(init?.headers).has('next-router-prefetch') ||
    (input instanceof Request && input.headers.has('next-router-prefetch'))
  const isTarget = (input: RequestInfo | URL, init?: RequestInit): boolean => {
    const url = input instanceof Request ? input.url : String(input)
    return (
      w.__cutDashboardStream === true &&
      url.includes('/app/dashboard') &&
      url.includes('_rsc') &&
      !isPrefetch(input, init)
    )
  }
  const cutAfterLine = async (res: Response): Promise<Response> => {
    const buf = new Uint8Array(await res.arrayBuffer())
    let cut = Math.floor(buf.length * 0.6)
    while (cut < buf.length && buf[cut] !== 10) cut++
    const init = { status: res.status, statusText: res.statusText, headers: res.headers }
    if (cut >= buf.length) return new Response(buf, init)
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(buf.slice(0, cut + 1))
        setTimeout(() => controller.error(new TypeError('Load failed')), 1000)
      },
    })
    return new Response(body, init)
  }
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await origFetch(input, init)
    if (!isTarget(input, init)) return res
    w.__cutCount = (w.__cutCount || 0) + 1
    return cutAfterLine(res)
  }
}

async function setCutArmed(page: Page, armed: boolean) {
  await page.evaluate((on) => {
    ;(window as unknown as CutWindow).__cutDashboardStream = on
  }, armed)
}

function cutCount(page: Page) {
  return page.evaluate(() => (window as unknown as CutWindow).__cutCount ?? 0)
}

function waitForDashboardRefetch(page: Page) {
  return page.waitForRequest(
    (r) =>
      r.url().includes('/app/dashboard') &&
      r.url().includes('_rsc') &&
      !r.headers()['next-router-prefetch'],
    { timeout: 10_000 },
  )
}

test.describe('Failed soft navigation to the dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installDashboardStreamCut)
  })

  test('Try again refetches the page after a failed navigation and shows the dashboard', async ({
    page,
  }) => {
    await page.goto('/app/quiz')
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible()
    await page.waitForLoadState('networkidle')

    await setCutArmed(page, true)
    await nav.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByText(ERROR_TEXT)).toBeVisible({ timeout: 15_000 })
    expect(await cutCount(page)).toBeGreaterThan(0)

    await setCutArmed(page, false)
    const refetch = waitForDashboardRefetch(page)
    await page.getByRole('button', { name: 'Try again' }).click()
    await refetch

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByText(ERROR_TEXT)).toHaveCount(0)
  })
})
