import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required — run \`supabase status\` to get it`)
  return value
}

// Environment-specific — no safe defaults; run `eval "$(supabase status -o env)"` to populate
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const ANON_KEY = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

/** Service role client — bypasses RLS, used for setup/teardown */
export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Anon client — subject to RLS, used before auth */
function getAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Create a test organization, returns its ID */
export async function createTestOrg(opts: {
  admin: SupabaseClient
  name: string
  slug: string
}): Promise<string> {
  const { data, error } = await opts.admin
    .from('organizations')
    .insert({ name: opts.name, slug: opts.slug })
    .select('id')
    .single()
  if (error) throw new Error(`createTestOrg: ${error.message}`)
  return data.id as string
}

/**
 * Create a test user in auth.users + public.users.
 * Returns the user's UUID.
 */
export async function createTestUser(opts: {
  admin: SupabaseClient
  orgId: string
  email: string
  password: string
  role: 'admin' | 'instructor' | 'student'
  fullName?: string
}): Promise<string> {
  // Create in auth.users
  const { data: authData, error: authError } = await opts.admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  })
  if (authError) throw new Error(`createTestUser auth: ${authError.message}`)
  const userId = authData.user.id

  // Insert into public.users
  const { error: userError } = await opts.admin.from('users').insert({
    id: userId,
    organization_id: opts.orgId,
    email: opts.email,
    full_name: opts.fullName ?? opts.email.split('@')[0],
    role: opts.role,
  })
  if (userError) throw new Error(`createTestUser public: ${userError.message}`)

  return userId
}

/** Sign in and return an authenticated Supabase client */
export async function getAuthenticatedClient(opts: {
  email: string
  password: string
}): Promise<SupabaseClient> {
  const client = getAnonClient()
  const { error } = await client.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  })
  if (error) throw new Error(`signIn: ${error.message}`)
  return client
}
