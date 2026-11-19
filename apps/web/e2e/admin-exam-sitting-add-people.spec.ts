import { randomUUID } from 'node:crypto'
import { expect as baseExpect, type Page, test } from '@playwright/test'
import { getAdminOrganizationId } from './helpers/admin-supabase'
import { cleanupCreatedExamConfigs, ensureExamConfigs } from './helpers/exam-config-cleanup'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { seedSitting } from './helpers/exam-sitting-seed'

// A dev server compiles a popup route on first open: generous timeouts, never sleeps.
const expect = baseExpect.configure({ timeout: 25_000 })

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })
test.setTimeout(240_000)

const BASE = '/app/admin/internal-exams/sittings'
const LIST = '/app/admin/internal-exams'

test.beforeEach(async () => {
  await ensureExamConfigs(await getAdminOrganizationId())
})

test.afterEach(async () => {
  const errors: string[] = []
  // Sittings first: a config cannot be removed while a sitting uses its subject.
  for (const step of [cleanupE2eExamSittings, cleanupCreatedExamConfigs]) {
    try {
      await step()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
})

const loadedAt = new Date()
test.skip(
  loadedAt.getUTCHours() === 23 && loadedAt.getUTCMinutes() >= 55,
  'UTC day rollover window',
)

const personRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const popup = (page: Page) => page.getByRole('dialog')
const noPopup = (page: Page) => expect(page.getByRole('dialog')).toHaveCount(0)

async function openPeoplePopup(page: Page) {
  await page.getByRole('button', { name: 'Add people' }).click()
  await expect(page).toHaveURL(/dlg=people/)
  await expect(popup(page).getByRole('heading', { name: 'Add people' })).toBeVisible()
}

async function searchPeople(page: Page, text: string) {
  await popup(page).getByLabel('Search name or email').fill(text)
  await expect(page).toHaveURL(/pq=/)
}

async function pickOption(page: Page, label: string, option: string) {
  await popup(page).getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function expectPopupFits(page: Page) {
  const vp = page.viewportSize()
  if (!vp) throw new Error('no viewport')
  const button = popup(page).getByRole('button', { name: /^Add selected/ })
  const box = await button.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.y ?? -1) >= 0).toBe(true)
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vp.height)
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(fits).toBe(true)
  const dialogFits = await popup(page).evaluate((el) => el.scrollWidth <= el.clientWidth)
  expect(dialogFits).toBe(true)
}

test('Add people: filter, tick across filters, reload, add, close paths, group and deactivated', async ({
  page,
}) => {
  const { sittingId, groups } = await seedSitting({
    status: 'scheduled',
    people: [{ name: 'E2E Inside Ann', entries: [] }],
    addable: [
      { name: 'E2E Add Zoe' },
      { name: 'E2E Add Vic' },
      { name: 'E2E Add Yan' },
      { name: 'E2E Add Xia' },
      { name: 'E2E Add Wes', deactivated: true },
    ],
    groups: [{ name: 'Alpha', members: ['E2E Add Yan', 'E2E Add Xia', 'E2E Add Wes'] }],
  })
  const groupName = groups[0]?.name ?? ''
  await page.goto(`${BASE}/${sittingId}`)

  await test.step('lists addable people only, searchable', async () => {
    await openPeoplePopup(page)
    await searchPeople(page, 'E2E Add')
    await expect(popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' })).toBeVisible()
    await expect(popup(page).getByRole('checkbox', { name: 'Select E2E Add Wes' })).toHaveCount(0)
    await searchPeople(page, 'E2E Inside')
    await expect(popup(page).getByText('No students to add.')).toBeVisible()
    await searchPeople(page, 'E2E Add')
    await expect(popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' })).toBeVisible()
  })

  await test.step('popup fits a phone and a wide desktop viewport', async () => {
    await popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' }).click()
    for (const size of [
      { width: 375, height: 667 },
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size)
      await expect(popup(page).getByRole('button', { name: /^Add selected/ })).toBeVisible()
      await expectPopupFits(page)
    }
    await popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' }).click()
  })

  await test.step('ticks survive a Group filter change', async () => {
    await pickOption(page, 'Group', groupName)
    await expect(page).toHaveURL(/pgroup=/)
    await expect(popup(page).getByRole('checkbox', { name: 'Select E2E Add Yan' })).toBeVisible()
    await expect(popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' })).toHaveCount(0)
    await popup(page).getByRole('checkbox', { name: 'Select E2E Add Yan' }).click()
    await pickOption(page, 'Group', 'All groups')
    await expect(page).not.toHaveURL(/pgroup=/)
    await expect(popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' })).toBeVisible()
    await popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' }).click()
    await expect(popup(page).getByRole('status')).toContainText('2 selected')
  })

  await test.step('reload keeps the popup and its filters, not the ticks', async () => {
    await page.reload()
    await expect(popup(page).getByRole('heading', { name: 'Add people' })).toBeVisible()
    await expect(popup(page).getByLabel('Search name or email')).toHaveValue('E2E Add')
    await expect(popup(page).getByRole('status')).toContainText('No one selected')
  })

  await test.step('Add selected closes the popup and lists the new people', async () => {
    await popup(page).getByRole('checkbox', { name: 'Select E2E Add Zoe' }).click()
    await popup(page).getByRole('checkbox', { name: 'Select E2E Add Vic' }).click()
    await popup(page).getByRole('button', { name: 'Add selected (2)' }).click()
    await noPopup(page)
    await expect(page).not.toHaveURL(/dlg=/)
    await expect(page.getByText('Added 2 people.').first()).toBeVisible()
    await expect(personRow(page, 'E2E Add Zoe')).toBeVisible()
    await expect(personRow(page, 'E2E Add Vic')).toBeVisible()
  })

  await test.step('Escape closes with focus back on the opener, Back closes too', async () => {
    await page.getByRole('button', { name: 'Add people' }).click()
    await expect(popup(page).getByRole('heading', { name: 'Add people' })).toBeVisible()
    await page.keyboard.press('Escape')
    await noPopup(page)
    await expect(page).not.toHaveURL(/dlg=/)
    await expect(page.getByRole('button', { name: 'Add people' })).toBeFocused()
    await openPeoplePopup(page)
    await page.goBack()
    await noPopup(page)
    await expect(page).not.toHaveURL(/dlg=/)
  })

  await test.step('Add whole group counts new and deactivated people and adds the group', async () => {
    await openPeoplePopup(page)
    await pickOption(page, 'Group', groupName)
    const addGroup = popup(page).getByRole('button', {
      name: `Add whole group "${groupName}" (2 new, 1 deactivated skipped)`,
    })
    await expect(addGroup).toBeEnabled()
    await addGroup.click()
    await noPopup(page)
    await expect(page.getByText('Added 2 people.').first()).toBeVisible()
    await expect(personRow(page, 'E2E Add Yan')).toBeVisible()
    await expect(personRow(page, 'E2E Add Xia')).toBeVisible()
    await expect(personRow(page, 'E2E Add Wes')).toHaveCount(0)
  })

  await test.step('a deactivated person is listed only under Status Deactivated and cannot be ticked', async () => {
    await openPeoplePopup(page)
    await searchPeople(page, 'E2E Add Wes')
    await expect(popup(page).getByText('No students to add.')).toBeVisible()
    await pickOption(page, 'Status', 'Deactivated')
    await expect(page).toHaveURL(/pstatus=inactive/)
    const wes = popup(page).getByRole('checkbox', { name: 'Select E2E Add Wes' })
    await expect(wes).toHaveAttribute('aria-disabled', 'true')
    await expect(popup(page).getByText('Deactivated', { exact: true }).first()).toBeVisible()
  })
})

test('Add exams: one person, blocked rows, two people with a skipped pair, deep link and bad ids', async ({
  page,
}) => {
  const { sittingId, people } = await seedSitting({
    status: 'scheduled',
    people: [
      { name: 'E2E Exam Ann', entries: [], enrolled: true },
      { name: 'E2E Exam Bob', entries: [], enrolled: true },
      { name: 'E2E Exam Cy', entries: [] },
      { name: 'E2E Exam Dee', entries: [{ state: 'finished_passed' }] },
    ],
  })
  const annId = people[0]?.userId ?? ''
  await page.goto(`${BASE}/${sittingId}`)
  const dialog = popup(page)
  const exams = () => dialog.getByRole('checkbox', { name: /^Add [A-Z]+$/ })

  await test.step('a person who is not enrolled has no tickable exam and a reason', async () => {
    await page.getByRole('button', { name: 'Actions for E2E Exam Cy' }).click()
    await page.getByRole('menuitem', { name: 'Add exams' }).click()
    await expect(dialog.getByRole('heading', { name: 'Add exams for E2E Exam Cy' })).toBeVisible()
    await expect(page).toHaveURL(/dlg=exams&ids=|ids=.*dlg=exams/)
    await expect(dialog.getByText('Not enrolled').first()).toBeVisible()
    await expect(exams()).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Add exams' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await noPopup(page)
  })

  await test.step('one person: tick an eligible exam, add, then it reads Already in this sitting', async () => {
    await page.getByRole('button', { name: 'Actions for E2E Exam Ann' }).click()
    await page.getByRole('menuitem', { name: 'Add exams' }).click()
    await expect(dialog.getByRole('heading', { name: 'Add exams for E2E Exam Ann' })).toBeVisible()
    await expect(exams().first()).toBeVisible()
    await exams().first().click()
    await expect(dialog.getByRole('status')).toContainText('1 exam for 1 person')
    await dialog.getByRole('button', { name: 'Add exams' }).click()
    await noPopup(page)
    await expect(page.getByText('Added 1 exam.').first()).toBeVisible()
    await expect(personRow(page, 'E2E Exam Ann')).not.toContainText('No exams')
    await page.getByRole('button', { name: 'Actions for E2E Exam Ann' }).click()
    await page.getByRole('menuitem', { name: 'Add exams' }).click()
    await expect(dialog.getByText('Already in this sitting')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await noPopup(page)
  })

  await test.step('a person with an attempt has Add exams but never Remove from sitting', async () => {
    await page.getByRole('button', { name: 'Actions for E2E Exam Dee' }).click()
    await expect(page.getByRole('menuitem', { name: 'Add exams' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Remove from sitting' })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  await test.step('two people: the blocked pair is sent and reported with its reason', async () => {
    await page.getByRole('checkbox', { name: 'Select E2E Exam Ann' }).click()
    await page.getByRole('checkbox', { name: 'Select E2E Exam Bob' }).click()
    await page.getByRole('button', { name: 'Add exams' }).click()
    await expect(dialog.getByRole('heading', { name: 'Add exams for 2 people' })).toBeVisible()
    await expect(dialog.getByText('1 of 2 can sit')).toBeVisible()
    await dialog.getByRole('checkbox', { name: 'Select all exams' }).click()
    await dialog.getByRole('button', { name: 'Add exams' }).click()
    await noPopup(page)
    await expect(page.getByText('Added 3 exams.').first()).toBeVisible()
    await expect(page.getByText('Skipped 1 exam:').first()).toBeVisible()
    await expect(page.getByText(/E2E Exam Ann · [A-Z]+: already in this sitting/)).toBeVisible()
    await page.getByRole('button', { name: 'Clear' }).click()
  })

  await test.step('a deep link keeps the popup across reload', async () => {
    await page.goto(`${BASE}/${sittingId}?dlg=exams&ids=${annId}`)
    await expect(dialog.getByRole('heading', { name: 'Add exams for E2E Exam Ann' })).toBeVisible()
    await page.reload()
    await expect(dialog.getByRole('heading', { name: 'Add exams for E2E Exam Ann' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await noPopup(page)
  })

  await test.step('ids of nobody in the sitting show a message; Close replaces the URL', async () => {
    await page.goto(`${BASE}/${sittingId}`)
    await page.goto(`${BASE}/${sittingId}?dlg=exams&ids=${randomUUID()}`)
    await expect(dialog.getByText('No valid people to add exams for.')).toBeVisible()
    await dialog.locator('[data-slot="button"]', { hasText: 'Close' }).click()
    await noPopup(page)
    await expect(page).not.toHaveURL(/dlg=|ids=/)
    await page.goBack()
    await noPopup(page)
    await expect(page).not.toHaveURL(/dlg=|ids=/)
  })
})

test('Select all: link, all-mode bar, Add exams for everyone, leaving all-mode', async ({
  page,
}) => {
  const COUNT = 62
  const names = Array.from({ length: COUNT }, (_, i) => `E2E Sel ${String(i).padStart(2, '0')}`)
  const { sittingId } = await seedSitting({
    status: 'scheduled',
    people: names.map((name) => ({ name, entries: [], enrolled: true })),
  })
  const header = page.getByRole('checkbox', { name: /^Select all \d+ shown$/ })

  await test.step('no Select all link under a search filter', async () => {
    await page.goto(`${BASE}/${sittingId}?q=E2E%20Sel`)
    await header.click()
    await expect(page.getByText('50 selected')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Select all \d+$/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear' }).click()
  })

  await test.step('page ticked offers Select all, which locks Remove', async () => {
    await page.goto(`${BASE}/${sittingId}`)
    await header.click()
    await page.getByRole('button', { name: `Select all ${COUNT}` }).click()
    await expect(page.getByText(`All ${COUNT} selected`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toBeDisabled()
    await expect(page.getByText('Clear select-all to remove people.')).toBeVisible()
  })

  await test.step('Add exams in all-mode covers every person', async () => {
    await page.getByRole('button', { name: 'Add exams' }).click()
    await expect(page).toHaveURL(/all=1/)
    const dialog = popup(page)
    await expect(
      dialog.getByRole('heading', { name: `Add exams for all ${COUNT} people` }),
    ).toBeVisible()
    await dialog
      .getByRole('checkbox', { name: /^Add [A-Z]+$/ })
      .first()
      .click()
    await expect(dialog.getByRole('status')).toContainText(`1 exam for ${COUNT} people`)
    await dialog.getByRole('button', { name: 'Add exams' }).click()
    await noPopup(page)
    await expect(page.getByText(`Added ${COUNT} exams.`).first()).toBeVisible()
    await expect(page.getByText(`All ${COUNT} selected`)).toBeVisible()
  })

  await test.step('unticking one row leaves all-mode', async () => {
    await page.getByRole('checkbox', { name: 'Select E2E Sel 00' }).click()
    await expect(page.getByText(`All ${COUNT} selected`)).toHaveCount(0)
    await expect(page.getByLabel('Search people in this sitting')).toBeVisible()
  })
})

test('Issue codes: bulk popup, Issue all codes, and Issue now from the Start confirm', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({
    status: 'scheduled',
    people: [
      { name: 'E2E Iss Ann', entries: [{ state: 'no_code' }] },
      { name: 'E2E Iss Bea', entries: [{ state: 'no_code' }] },
      { name: 'E2E Iss Cy', entries: [{ state: 'live' }] },
      { name: 'E2E Iss Dee', entries: [{ state: 'expired' }] },
    ],
  })
  await page.goto(`${BASE}/${sittingId}`)
  const dialog = popup(page)

  await test.step('bulk Issue codes previews and issues for the ticked people', async () => {
    await expect(page.getByRole('button', { name: 'Issue all codes (3)' })).toBeVisible()
    for (const n of ['Ann', 'Bea', 'Cy']) {
      await page.getByRole('checkbox', { name: `Select E2E Iss ${n}` }).click()
    }
    await page.getByRole('button', { name: 'Issue codes' }).click()
    await expect(page).toHaveURL(/dlg=issue/)
    await expect(dialog.getByText('Will issue 2 codes for 2 students.')).toBeVisible()
    await expect(dialog.getByText('1 exam already has a code.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Issue 2 codes' }).click()
    await noPopup(page)
    await expect(page.getByText('Issued 2 codes.').first()).toBeVisible()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(personRow(page, 'E2E Iss Ann')).toContainText('Ready')
    await expect(personRow(page, 'E2E Iss Bea')).toContainText('Ready')
  })

  await test.step('Issue all codes re-issues the expired code', async () => {
    await expect(personRow(page, 'E2E Iss Dee')).toContainText('Needs codes')
    await page.getByRole('button', { name: 'Issue all codes (1)' }).click()
    await expect(dialog.getByText('Will issue 1 code for 1 student.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Issue 1 code' }).click()
    await noPopup(page)
    await expect(personRow(page, 'E2E Iss Dee')).toContainText('Ready')
    await expect(page.getByRole('button', { name: /^Issue all codes/ })).toHaveCount(0)
  })

  await test.step('Issue now hides the Start confirm; Cancel and Issue bring it back refreshed', async () => {
    const second = await seedSitting({
      status: 'scheduled',
      people: [{ name: 'E2E Now Eve', entries: [{ state: 'no_code' }] }],
    })
    await page.goto(`${BASE}/${second.sittingId}`)
    await page.getByRole('button', { name: 'Start sitting' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm.getByText(/1 exam has no code yet/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Issue now' }).click()
    await expect(page).toHaveURL(/dlg=issue/)
    await expect(dialog.getByText('Will issue 1 code for 1 student.')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(confirm.getByText(/1 exam has no code yet/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Issue now' }).click()
    await dialog.getByRole('button', { name: 'Issue 1 code' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(confirm.getByText(/has no code yet|have no code yet/)).toHaveCount(0)
    await expect(confirm.getByRole('button', { name: 'Issue now' })).toHaveCount(0)
  })
})

test('Add exams and Issue codes popups at 375 px: no sideways scroll, Esc closes, focus returns to the opener', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({
    status: 'scheduled',
    people: [{ name: 'E2E Phone Ann', entries: [{ state: 'no_code' }] }],
  })
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('checkbox', { name: 'Select E2E Phone Ann' }).click()

  for (const [opener, dlg] of [
    ['Add exams', /dlg=exams/],
    ['Issue codes', /dlg=issue/],
  ] as const) {
    await test.step(`${opener} popup`, async () => {
      const button = page.getByRole('button', { name: opener, exact: true })
      await button.click()
      await expect(page).toHaveURL(dlg)
      await expect(popup(page).getByRole('heading', { name: opener })).toBeVisible()
      const pageFits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(pageFits).toBe(true)
      const dialogFits = await popup(page).evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(dialogFits).toBe(true)
      const box = await popup(page).boundingBox()
      expect(box?.x).toBeGreaterThanOrEqual(0)
      expect((box?.x ?? 0) + (box?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(375)
      await page.keyboard.press('Escape')
      await noPopup(page)
      await expect(page).not.toHaveURL(/dlg=/)
      await expect(button).toBeFocused()
    })
  }
})

test('Internal Exams opens on the Sittings tab; Codes and Attempts stay deep-linkable', async ({
  page,
}) => {
  await page.goto(LIST)
  const tabs = page.getByRole('tab')
  await expect(page.getByRole('tab', { name: /^Sittings/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('button', { name: /New sitting/ })).toBeVisible()
  const labels = await tabs.allTextContents()
  expect(labels.map((l) => l.replace(/\d+$/, '').trim())).toEqual(['Sittings', 'Codes', 'Attempts'])

  for (const [tab, name] of [
    ['codes', /^Codes/],
    ['attempts', /^Attempts/],
  ] as const) {
    await page.goto(`${LIST}?tab=${tab}`)
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: /New sitting/ })).toHaveCount(0)
  }
})
