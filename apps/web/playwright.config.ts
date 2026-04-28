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
      // setup is required so that e2e/.auth/user.json exists for the
      // student-side context opened inside the internal-exam-* specs.
      dependencies: ['setup', 'admin-setup'],
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
