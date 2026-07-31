import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '.env.local') })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html']] : [['html']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    { name: 'admin-setup', testMatch: 'admin-auth.setup.ts' },
    {
      name: 'internal-exam-student-setup',
      testMatch: 'internal-exam-student-auth.setup.ts',
      // Ordered after admin-setup on purpose. This setup needs the admin user to
      // exist (it calls signInAsAdmin), but it must NOT provision one itself: an
      // ensure*User() password reset revokes every existing session for that
      // account, so provisioning the admin here would kill the session that
      // admin-setup has already saved to e2e/.auth/admin.json.
      // Without this edge both setups sit in the same dependency phase with no
      // defined order between them, so whether the suite passed came down to
      // incidental scheduling — see PR #1143, where it did not. See also #1146.
      dependencies: ['admin-setup'],
    },
    {
      name: 'e2e',
      testMatch: '**/*.spec.ts',
      testIgnore: [
        '**/redteam/**',
        '**/admin-*.spec.ts',
        // Internal Exam cross-role specs need both admin + student auth
        // states; they run under the admin-e2e project (depends on
        // admin-setup) and open a separate student context inside the test.
        '**/internal-exam-*.spec.ts',
      ],
      dependencies: ['setup'],
    },
    {
      name: 'admin-e2e',
      testMatch: ['**/admin-*.spec.ts', '**/internal-exam-*.spec.ts'],
      testIgnore: '**/redteam/**',
      // internal-exam-student-setup creates a dedicated student fixture for the
      // student-side context spawned inside the internal-exam-* specs. Using a
      // dedicated user (not user.json) avoids session-rotation invalidation
      // caused by the prior `e2e` project's specs running against user.json.
      // `setup` is listed so admin-students.spec.ts's non-admin access tests can
      // log in as the shared student without provisioning it themselves — calling
      // an ensure*User() helper here would reset that account's password and
      // revoke the session `setup` already saved to e2e/.auth/user.json.
      // (settings.spec.ts changes that password mid-run and restores it in its
      // own afterAll, so `setup` is the initial writer, not the only one.)
      dependencies: ['setup', 'admin-setup', 'internal-exam-student-setup'],
    },
    {
      name: 'redteam',
      testDir: './e2e/redteam',
      testMatch: '**/*.spec.ts',
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
