/**
 * Seed a test student user for local development.
 * Creates an auth user + users table row.
 *
 * Usage: cd apps/web && npx tsx scripts/seed-test-user.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local from repo root
function loadEnv() {
  const envPath = resolve(__dirname, '../../../.env.local')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const val = trimmed.slice(eqIdx + 1)
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const TEST_EMAIL = 'pilot.oleksandr@proton.me'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Seeding test user: ${TEST_EMAIL}`)

  // 1. Check if auth user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existing = existingUsers?.users?.find((u) => u.email === TEST_EMAIL)

  let authUserId: string

  if (existing) {
    console.log(`Auth user already exists: ${existing.id}`)
    authUserId = existing.id
  } else {
    // Create auth user with a known password for dev (magic link still works)
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      email_confirm: true,
    })
    if (createErr) throw new Error(`Failed to create auth user: ${createErr.message}`)
    authUserId = newUser.user.id
    console.log(`Created auth user: ${authUserId}`)
  }

  // 2. Get the org (Egmont Aviation — created by import script)
  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('slug', 'egmont-aviation')
    .single()

  if (!org) {
    throw new Error(
      'Organization "Egmont Aviation" not found. Run the import script first to bootstrap data.',
    )
  }
  console.log(`Organization: ${org.name} (${org.id})`)

  // 3. Upsert user row in public.users table
  const { error: upsertErr } = await admin.from('users').upsert(
    {
      id: authUserId,
      organization_id: org.id,
      email: TEST_EMAIL,
      full_name: 'Oleksandr (Test Student)',
      role: 'student',
    },
    { onConflict: 'id' },
  )

  if (upsertErr) throw new Error(`Failed to upsert user: ${upsertErr.message}`)
  console.log(`User row upserted: ${TEST_EMAIL} → role: student, org: ${org.name}`)

  console.log('\nDone! You can now sign in at http://localhost:3000 with this email.')
  console.log('Supabase will send a magic link to your inbox.')
}

main().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
