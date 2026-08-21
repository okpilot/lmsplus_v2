import { expect, test } from '@playwright/test'

// Use admin auth state from admin-auth.setup.ts
test.use({ storageState: 'e2e/.auth/admin.json' })

// ── Bare-path landing (#1170) ─────────────────────────────────────────────────
//
// These are the routing assertions for #1170. They cannot be covered at the unit
// tier: the jsdom tests for these pages assert the `redirect` mock, which pins
// the argument but can never observe whether the route resolves at all — and
// "the route does not resolve" IS the defect. Every route asserted below rendered
// Next's built-in 404 before this change.
//
// A student-hitting-/app/admin case is deliberately NOT here: `proxy.ts` already
// bounces that today with the page absent, so it would pass with the fix reverted.
// admin-students.spec.ts § Access Control covers the property — but via
// /app/admin/students, i.e. proxy.ts's `startsWith('/app/admin/')` branch. The
// `pathname === '/app/admin'` branch is not asserted student-side HERE: every test in
// this file uses the default admin context and none opens its own. Note the file-level
// `storageState` is NOT what prevents it — `admin-students.spec.ts` declares the same
// admin state and still reaches a student in its § Access Control, via a
// `newContext({ storageState: undefined })` plus an in-test login. Whether some OTHER
// spec asserts this branch is deliberately not claimed here; derive it by grepping for
// specs that navigate an admin path from a non-admin session.
// Layer 2 (`page.tsx`'s own requireAdmin()) bounces a non-admin there regardless,
// which is why red-team rated the gap LOW rather than a hole.
test.describe('Admin bare-path landing', () => {
  test('admin landing on the bare admin path reaches the admin dashboard', async ({ page }) => {
    await page.goto('/app/admin')

    await expect(page).toHaveURL('/app/admin/dashboard', { timeout: 10_000 })
  })

  test('admin landing on the bare app path reaches the student dashboard', async ({ page }) => {
    await page.goto('/app')

    await expect(page).toHaveURL('/app/dashboard', { timeout: 10_000 })
  })

  test('an unmatched url shows the root not-found', async ({ page }) => {
    // The counterpart to the admin case below: unmatched urls resolve to the ROOT
    // boundary, which carries no app shell. Asserting both is what pins each file
    // to its own segment.
    await page.goto('/definitely-not-a-route')

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible()
  })

  test('a malformed student id shows the admin not-found inside the app shell', async ({
    page,
  }) => {
    await page.goto('/app/admin/dashboard/students/not-a-uuid')

    // `exact` matters: getByRole's name option is a case-insensitive SUBSTRING
    // match by default, and 'Not found' is a substring of the root boundary's
    // 'Page not found' — so without it this passes whichever boundary answered.
    await expect(page.getByRole('heading', { name: 'Not found', exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('link', { name: 'Back to admin dashboard' })).toBeVisible()
    // The shell assertion is the load-bearing half: it is what fails if the
    // not-found file lands at the wrong segment and the root boundary — which
    // renders with no shell — answers instead.
    await expect(page.getByRole('link', { name: 'Questions' })).toBeVisible()
  })
})
