/**
 * Capture-and-replay helpers for the Server Action red-team specs: read action ids from the
 * client bundles a page loads, capture one real action request's headers, replay it with
 * attacker-chosen arguments. Type-only Playwright imports so the module loads under Vitest.
 */
import type { APIRequestContext, Page } from '@playwright/test'

// Client-bundle action references: production `createServerReference("<id>", …, "<name>")`,
// dev (turbopack) `/* __next_internal_action_entry_do_not_use__ [{"<id>":{"name":"<name>"}}…`.
const REFERENCE_RES = [
  /createServerReference\)?\(\s*"([0-9a-f]{40,})"[^"]*?"(\w+)"\s*\)/g,
  /"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g,
]

const DROPPED_HEADERS = ['cookie', 'content-length', 'host']

export function extractActionIds(js: string, into: Map<string, string>): void {
  for (const re of REFERENCE_RES)
    for (const m of js.matchAll(re)) if (m[1] && m[2]) into.set(m[2], m[1])
}

export function buildReplayHeaders(
  captured: Record<string, string>,
  actionId: string,
  origin: string,
): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(captured)) {
    if (!DROPPED_HEADERS.includes(k.toLowerCase())) headers[k] = v
  }
  headers['next-action'] = actionId
  headers.origin = origin
  return headers
}

export async function signInViaForm(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Email address').fill(creds.email)
  await page.getByLabel('Password', { exact: true }).fill(creds.password)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
}

/** Registers the bundle-scan and first-action-request listeners; call before navigating. */
export function watchServerActions(page: Page): {
  headers(): Record<string, string> | undefined
  settle(): Promise<Map<string, string>>
} {
  const ids = new Map<string, string>()
  const scripts: Promise<void>[] = []
  let headers: Record<string, string> | undefined
  page.on('response', (res) => {
    if (!res.url().includes('/_next/') || !res.url().split('?')[0]?.endsWith('.js')) return
    scripts.push(
      res
        .text()
        .then((js) => extractActionIds(js, ids))
        .catch(() => {}),
    )
  })
  page.on('request', (req) => {
    const h = req.headers()
    if (req.method() === 'POST' && h['next-action'] && !headers) headers = h
  })
  return {
    headers: () => headers,
    settle: async () => {
      await Promise.all(scripts)
      return ids
    },
  }
}

export async function postServerAction(
  req: Pick<APIRequestContext, 'post'>,
  opts: {
    url: string
    headers: Record<string, string>
    id: string
    origin: string
    arg: Record<string, unknown>
  },
): Promise<string> {
  const res = await req.post(opts.url, {
    headers: buildReplayHeaders(opts.headers, opts.id, opts.origin),
    data: JSON.stringify([opts.arg]),
    maxRedirects: 0,
  })
  return res.text()
}
