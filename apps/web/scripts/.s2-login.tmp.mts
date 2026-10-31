import { chromium } from '@playwright/test'
import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD, ensureAdminTestUser } from '../e2e/helpers/admin-supabase'
await ensureAdminTestUser()
const b = await chromium.launch(); const p = await b.newPage()
await p.goto('http://localhost:3200/')
await p.getByLabel('Email address').fill(ADMIN_TEST_EMAIL)
await p.getByLabel('Password', { exact: true }).fill(ADMIN_TEST_PASSWORD)
await p.getByRole('button', { name: 'Sign in' }).click()
await p.waitForURL('**/app/dashboard', { timeout: 60_000 })
await p.context().storageState({ path: '/tmp/claude-1000/-media-sasha-T7-101-Claude-Projects-01-LMS-Plus/5750a55e-6be0-461c-92c0-0abe64ca7ae1/scratchpad/s2eval/admin.json' })
console.log('LOGIN_OK'); await b.close()
