import { expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

const ERROR_TEXT = 'An unexpected error occurred.'

type CutHelpers = {
  isTarget: (input: RequestInfo | URL, init?: RequestInit) => boolean
  cutAfterLine: (res: Response) => Promise<Response>
}
type CutWindow = Window & {
  __cutDashboardStream?: boolean
  __cutCount?: number
  __cutFailed?: number
  __cutHelpers?: CutHelpers
}

/** Init script 1: targets a non-prefetch dashboard RSC fetch while armed; cuts a body after a line. */
function defineCutHelpers() {
  const w = window as unknown as CutWindow
  const isTarget: CutHelpers['isTarget'] = (input, init) => {
    const req = input instanceof Request ? input : null
    const url = req ? req.url : String(input)
    const prefetch =
      new Headers(init?.headers).has('next-router-prefetch') ||
      req?.headers.has('next-router-prefetch') === true
    const route = url.includes('/app/dashboard') && url.includes('_rsc')
    return w.__cutDashboardStream === true && route && !prefetch
  }
  const cutAfterLine: CutHelpers['cutAfterLine'] = async (res) => {
    const buf = new Uint8Array(await res.arrayBuffer())
    let cut = Math.floor(buf.length * 0.6)
    while (cut >= 0 && buf[cut] !== 10) cut--
    const init = { status: res.status, statusText: res.statusText, headers: res.headers }
    if (cut < 0) {
      w.__cutFailed = buf.length
      return new Response(buf, init)
    }
    w.__cutCount = (w.__cutCount || 0) + 1
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(buf.slice(0, cut + 1))
        setTimeout(() => controller.error(new TypeError('Load failed')), 1000)
      },
    })
    return new Response(body, init)
  }
  w.__cutHelpers = { isTarget, cutAfterLine }
}

/** Init script 2: routes every fetch through the cut helpers. */
function installDashboardStreamCut() {
  const w = window as unknown as CutWindow
  const origFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await origFetch(input, init)
    const helpers = w.__cutHelpers
    if (!helpers?.isTarget(input, init)) return res
    return helpers.cutAfterLine(res)
  }
}

async function setCutArmed(page: Page, armed: boolean) {
  await page.evaluate((on) => {
    ;(window as unknown as CutWindow).__cutDashboardStream = on
  }, armed)
}

function cutState(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as CutWindow
    return { count: w.__cutCount ?? 0, failedBytes: w.__cutFailed }
  })
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
    await page.addInitScript(defineCutHelpers)
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
    await expect
      .poll(async () => {
        const s = await cutState(page)
        return s.count > 0 || s.failedBytes !== undefined
      })
      .toBe(true)
    expect(
      (await cutState(page)).failedBytes,
      'dashboard response had no line break to cut at',
    ).toBeUndefined()
    await expect(page.getByText(ERROR_TEXT)).toBeVisible({ timeout: 15_000 })

    await setCutArmed(page, false)
    const refetch = waitForDashboardRefetch(page)
    await page.getByRole('button', { name: 'Try again' }).click()
    await refetch

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByText(ERROR_TEXT)).toHaveCount(0)
  })
})
