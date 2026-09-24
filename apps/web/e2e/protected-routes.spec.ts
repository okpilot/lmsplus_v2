import { expect, test } from '@playwright/test'

// These tests run WITHOUT authentication — no storageState
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('protected routes redirect to login', () => {
  test('dashboard redirects to login', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  })

  test('quiz page redirects to login carrying it as the next destination', async ({ page }) => {
    await page.goto('/app/quiz')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('next')).toBe('/app/quiz')
  })

  test('progress page redirects to login carrying it as the next destination', async ({ page }) => {
    await page.goto('/app/progress')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('next')).toBe('/app/progress')
  })
})

test.describe('login page content', () => {
  test('shows login form with email input and submit button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
    await expect(page.getByText('Sign in to your account')).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
