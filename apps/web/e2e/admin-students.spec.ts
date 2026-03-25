import { expect, test } from '@playwright/test'
import { getAdminClient } from './helpers/supabase'

// Use admin auth state from admin-auth.setup.ts
test.use({ storageState: 'e2e/.auth/admin.json' })

// ── Helpers ───────────────────────────────────────────────────────────────────

const E2E_STUDENT_EMAIL_PREFIX = 'e2e-student-mgmt-'
const E2E_STUDENT_DOMAIN = '@lmsplus.local'

/** Delete E2E-created students by email prefix to keep the DB clean. */
async function cleanupE2eStudents() {
  const admin = getAdminClient()
  const { data: rows } = await admin
    .from('users')
    .select('id, email')
    .like('email', `${E2E_STUDENT_EMAIL_PREFIX}%`)
  if (!rows?.length) return
  for (const row of rows) {
    await admin.auth.admin.deleteUser(row.id)
  }
}

function uniqueEmail() {
  return `${E2E_STUDENT_EMAIL_PREFIX}${Date.now()}${E2E_STUDENT_DOMAIN}`
}

// ── Section 1: Navigation ─────────────────────────────────────────────────────

test.describe('Admin Student Management — Navigation', () => {
  test('admin can access /app/admin/students and sees heading', async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible()
  })

  test('Students link appears in the sidebar nav for admin users', async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.getByRole('link', { name: 'Students' })).toBeVisible()
  })
})

// ── Section 2: Table renders ──────────────────────────────────────────────────

test.describe('Admin Student Management — Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible()
  })

  test('shows user count summary and table with expected columns', async ({ page }) => {
    // User count summary
    await expect(page.getByText(/\d+ users?/)).toBeVisible()

    // Column headers
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  })

  test('shows at least one row in the table (seed data present)', async ({ page }) => {
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('shows New Student button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Student' })).toBeVisible()
  })
})

// ── Section 3: Create student ─────────────────────────────────────────────────

test.describe('Admin Student Management — Create', () => {
  test.afterEach(async () => {
    await cleanupE2eStudents()
  })

  test('creates a new student and verifies they appear in the table', async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible()

    const email = uniqueEmail()
    const fullName = `E2E Student ${Date.now()}`

    // Open create dialog
    await page.getByRole('button', { name: 'New Student' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'New Student', level: 2 })).toBeVisible()

    // Fill form fields
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Full name').fill(fullName)
    await page.getByLabel('Temporary password').fill('TempPass123!')

    // Submit
    await page.getByRole('button', { name: 'Create Student' }).click()

    // Success toast
    await expect(page.getByText('Student created')).toBeVisible({ timeout: 10_000 })

    // Student should appear in the table after page reload (Server Component re-render)
    await page.reload()
    await expect(page.getByText(fullName)).toBeVisible({ timeout: 10_000 })
  })
})

// ── Section 4: Edit student ───────────────────────────────────────────────────

test.describe('Admin Student Management — Edit', () => {
  test('opens edit dialog for first student, changes name, saves, verifies update', async ({
    page,
  }) => {
    await page.goto('/app/admin/students')
    await expect(page.locator('tbody tr').first()).toBeVisible()

    // Read the original name from the first row for verification
    const firstRow = page.locator('tbody tr').first()
    const originalName = await firstRow.locator('td').first().textContent()

    // Click edit button on first row
    await firstRow.getByRole('button', { name: 'Edit student' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Edit Student')).toBeVisible()
    await expect(page.getByText('Update the student details below.')).toBeVisible()

    // Change name using the fullName input
    const nameInput = page.getByLabel('Full name')
    await nameInput.clear()
    const updatedName = `${originalName?.trim() ?? 'Student'} (edited)`
    await nameInput.fill(updatedName)

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('Student updated')).toBeVisible({ timeout: 10_000 })

    // Verify updated name appears in table after reload
    await page.reload()
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 })

    // Restore original name (cleanup)
    await page.locator('tbody tr').first().getByRole('button', { name: 'Edit student' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    const nameInputRestore = page.getByLabel('Full name')
    await nameInputRestore.clear()
    await nameInputRestore.fill(originalName?.trim() ?? '')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('Student updated')).toBeVisible({ timeout: 10_000 })
  })
})

// ── Section 5: Deactivate student ────────────────────────────────────────────

test.describe('Admin Student Management — Deactivate / Reactivate', () => {
  test.afterEach(async () => {
    await cleanupE2eStudents()
  })

  test('deactivates a student and verifies Inactive badge', async ({ page }) => {
    await page.goto('/app/admin/students')

    const email = uniqueEmail()
    const fullName = `E2E Deactivate ${Date.now()}`

    // Create the student first
    await page.getByRole('button', { name: 'New Student' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Full name').fill(fullName)
    await page.getByLabel('Temporary password').fill('TempPass123!')
    await page.getByRole('button', { name: 'Create Student' }).click()
    await expect(page.getByText('Student created')).toBeVisible({ timeout: 10_000 })
    await page.reload()

    // Find the row for our new student and click Deactivate
    const studentRow = page.locator('tbody tr').filter({ hasText: fullName })
    await expect(studentRow).toBeVisible({ timeout: 10_000 })
    await studentRow.getByRole('button', { name: 'Deactivate student' }).click()

    // Confirmation dialog
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Deactivate student')).toBeVisible()
    await page.getByRole('button', { name: 'Deactivate' }).click()

    // Success toast
    await expect(page.getByText('Student deactivated')).toBeVisible({ timeout: 10_000 })

    // Status badge in the row should change to Inactive after reload
    await page.reload()
    const updatedRow = page.locator('tbody tr').filter({ hasText: fullName })
    await expect(updatedRow.getByText('Inactive')).toBeVisible({ timeout: 10_000 })
  })

  // ── Section 6: Reactivate student ──────────────────────────────────────────

  test('reactivates an inactive student and verifies Active badge', async ({ page }) => {
    await page.goto('/app/admin/students')

    const email = uniqueEmail()
    const fullName = `E2E Reactivate ${Date.now()}`

    // Create and immediately deactivate via DB helper to set up test state
    const admin = getAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', 'egmont-aviation')
      .single()

    if (!org) throw new Error('Org not found — run seed-admin-eval.ts first')

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: 'TempPass123!',
      email_confirm: true,
    })
    if (authError) throw new Error(`reactivate test setup auth: ${authError.message}`)
    const userId = authData.user.id

    const { error: insertError } = await admin.from('users').insert({
      id: userId,
      organization_id: org.id,
      email,
      full_name: fullName,
      role: 'student',
      deleted_at: new Date().toISOString(),
    })
    if (insertError) throw new Error(`reactivate test setup insert: ${insertError.message}`)

    // Navigate to the page and filter by inactive to find the student
    await page.goto('/app/admin/students?status=inactive')
    await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible()

    const studentRow = page.locator('tbody tr').filter({ hasText: fullName })
    await expect(studentRow).toBeVisible({ timeout: 10_000 })
    await studentRow.getByRole('button', { name: 'Reactivate student' }).click()

    // Confirmation dialog
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Reactivate student')).toBeVisible()
    await page.getByRole('button', { name: 'Reactivate' }).click()

    // Success toast
    await expect(page.getByText('Student reactivated')).toBeVisible({ timeout: 10_000 })

    // Should no longer appear in inactive-only view after reload
    await page.reload()
    await expect(page.locator('tbody tr').filter({ hasText: fullName })).toHaveCount(0, {
      timeout: 10_000,
    })

    // Confirm Active badge in the all-students view
    await page.goto('/app/admin/students')
    const restoredRow = page.locator('tbody tr').filter({ hasText: fullName })
    await expect(restoredRow.getByText('Active')).toBeVisible({ timeout: 10_000 })
  })
})

// ── Section 7: Reset password ─────────────────────────────────────────────────

test.describe('Admin Student Management — Reset Password', () => {
  test('opens reset password dialog and shows generated password field', async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.locator('tbody tr').first()).toBeVisible()

    // Click reset password on first row
    const firstRow = page.locator('tbody tr').first()
    await firstRow.getByRole('button', { name: 'Reset password' }).click()

    // Dialog opens with a pre-filled password field
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Reset password')).toBeVisible()

    const passwordInput = page.getByLabel('Temporary password')
    await expect(passwordInput).toBeVisible()

    // Generated password should be non-empty (12 chars)
    const generatedPassword = await passwordInput.inputValue()
    expect(generatedPassword.length).toBeGreaterThanOrEqual(6)

    // Generate button regenerates a different password
    const originalPassword = generatedPassword
    await page.getByRole('button', { name: 'Generate' }).click()
    const newPassword = await passwordInput.inputValue()
    expect(newPassword).not.toBe(originalPassword)

    // Close without submitting
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3_000 })
  })

  test('submits reset password and shows success toast', async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.locator('tbody tr').first()).toBeVisible()

    const firstRow = page.locator('tbody tr').first()
    await firstRow.getByRole('button', { name: 'Reset password' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })

    // Submit with the auto-generated password — scope to dialog to avoid matching row button
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Reset password' }).click()

    await expect(page.getByText('Password reset.')).toBeVisible({ timeout: 10_000 })
  })
})

// ── Section 8: Filters ────────────────────────────────────────────────────────

test.describe('Admin Student Management — Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible()
  })

  test('status filter — selecting Active updates URL with status=active', async ({ page }) => {
    const statusTrigger = page.locator('[aria-label="Status"]')
    await statusTrigger.click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: 'Active' }).click()

    await expect(page).toHaveURL(/status=active/)
  })

  test('status filter — selecting Inactive updates URL with status=inactive', async ({ page }) => {
    const statusTrigger = page.locator('[aria-label="Status"]')
    await statusTrigger.click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: 'Inactive' }).click()

    await expect(page).toHaveURL(/status=inactive/)
  })

  test('role filter — selecting Student updates URL with role=student', async ({ page }) => {
    const roleTrigger = page.locator('[aria-label="Role"]')
    await roleTrigger.click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: 'Student' }).click()

    await expect(page).toHaveURL(/role=student/)
  })

  test('search input filters by name and updates URL', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search students...')
    await searchInput.fill('admin')
    // Debounce: 300ms in StudentFiltersBar
    await page.waitForURL(/search=admin/, { timeout: 5_000 })
    await expect(page).toHaveURL(/search=admin/)
  })

  test('Clear button removes all filters', async ({ page }) => {
    // Apply a filter first
    await page.goto('/app/admin/students?status=active&role=student')
    await expect(page).toHaveURL(/status=active/)

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page).toHaveURL('/app/admin/students')
  })

  test('shows empty state when search matches no students', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search students...')
    await searchInput.fill('xyznonexistent12345abc')
    await page.waitForURL(/search=xyznonexistent12345abc/, { timeout: 5_000 })

    await expect(
      page.getByText('No students found. Adjust filters or create a new student.'),
    ).toBeVisible({ timeout: 5_000 })
  })
})

// ── Section 9: Non-admin access ───────────────────────────────────────────────
//
// The proxy (middleware) returns 403 for authenticated non-admin users and
// redirects to '/' for unauthenticated users. We test both:
//
//  a) Unauthenticated — tested here by clearing cookies (no student auth state
//     available in the admin-e2e project, which only depends on admin-setup).
//
//  b) Authenticated student → 403 — covered by the redteam specs which have
//     their own setup and directly call the proxy with a student session.

test.describe('Admin Student Management — Access Control', () => {
  test('unauthenticated request to /app/admin/students redirects to login', async ({ page }) => {
    // Clear the admin session cookies to simulate an unauthenticated browser
    await page.context().clearCookies()

    await page.goto('/app/admin/students')
    // Middleware redirects unauthenticated /app/* to the login page
    await expect(page).toHaveURL('/', { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  })

  test('authenticated student receives 403 when accessing /app/admin/students', async ({
    browser,
  }) => {
    // Sign in as a student in a fresh browser context (no saved state needed).
    const { ensureTestUser, TEST_EMAIL, TEST_PASSWORD } = await import('./helpers/supabase')
    await ensureTestUser()

    const studentContext = await browser.newContext()
    const page = await studentContext.newPage()

    // Perform the login flow to get a valid student session
    await page.goto('/')
    await page.getByLabel('Email address').fill(TEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

    // Now attempt to access an admin route
    const response = await page.goto('/app/admin/students')
    expect(response?.status()).toBe(403)

    await studentContext.close()
  })
})
