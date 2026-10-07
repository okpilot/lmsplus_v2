import { expect, type Page, test } from '@playwright/test'

// No saved auth state: the login form is the translated surface. Creates no rows, so no cleanup.
test.use({ storageState: { cookies: [], origins: [] } })

/** Wraps every text node under `selector` matching `text` in <font><font>, as a browser translator does. */
async function translateText(page: Page, selector: string, text: string) {
  await page.evaluate(
    ({ selector, text }) => {
      const root = document.querySelector(selector)
      if (!root) throw new Error(`no element for ${selector}`)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let wrapped = 0
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent?.trim() !== text) continue
        const outer = document.createElement('font')
        const inner = document.createElement('font')
        n.parentNode?.replaceChild(outer, n)
        outer.appendChild(inner)
        inner.appendChild(n)
        wrapped++
      }
      if (wrapped === 0) throw new Error(`no text node "${text}" under ${selector}`)
    },
    { selector, text },
  )
}

test('translated login form keeps working: busy label and error message render, and survive a reload', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  // The shipped bundle installs the guard: removing a node the translator moved does not throw.
  const removal = await page.evaluate(() => {
    try {
      document.body.removeChild(document.createTextNode('moved'))
      return 'no throw'
    } catch (e) {
      return String(e)
    }
  })
  expect(removal).toBe('no throw')
  await page.getByLabel('Email address').fill('translator-guard@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1A!')

  // Entry: translator wraps the button label, then the submit swaps it for the busy label.
  await translateText(page, 'button[type="submit"]', 'Sign in')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // In progress -> exit: the rejection message is inserted next to the translated nodes.
  await expect(page.getByText('Invalid email or password.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  expect(pageErrors).toEqual([])

  // Translator wraps the error text; a second failed submit replaces/removes it.
  await translateText(page, 'form', 'Invalid email or password.')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password.')).toBeVisible()
  expect(pageErrors).toEqual([])

  // Reload mid-flow: the page recovers to a working untranslated form.
  await page.reload()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  await expect(page.getByText('Invalid email or password.')).toHaveCount(0)
  await page.getByLabel('Email address').fill('translator-guard@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1A!')
  await translateText(page, 'button[type="submit"]', 'Sign in')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password.')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  expect(pageErrors).toEqual([])
})
