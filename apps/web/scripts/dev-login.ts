import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
/**
 * Dev-only script: generates a magic link for local login without sending an email.
 * Usage: npx tsx scripts/dev-login.ts [email]
 * Defaults to pilot.oleksandr@proton.me
 */
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const email = process.argv[2] || 'pilot.oleksandr@proton.me'
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'http://localhost:3000/auth/callback' },
  })

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  // The link from Supabase points to their domain — rewrite to localhost
  const props = data.properties
  const localLink = `http://localhost:3000/auth/callback?token_hash=${props.hashed_token}&type=magiclink`

  console.log(`\nMagic link for: ${email}`)
  console.log(`\n${localLink}\n`)
  console.log('Paste this URL in your browser to log in.\n')
}

main()
