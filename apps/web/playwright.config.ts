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
    {
      name: 'e2e',
      testMatch: '**/*.spec.ts',
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
