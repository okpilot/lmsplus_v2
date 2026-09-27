/**
 * CLI gate for a `:3000` server started OUTSIDE Playwright (playwright.config.ts
 * calls assertLocalEnv() itself for every spec run). Run before starting such a
 * server: `pnpm --filter @repo/web exec tsx e2e/check-local-env.ts`.
 */
import { resolve } from 'node:path'
import { assertLocalEnv } from './helpers/local-env'

try {
  assertLocalEnv(resolve(__dirname, '..'))
  console.log('local-env: ok')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
